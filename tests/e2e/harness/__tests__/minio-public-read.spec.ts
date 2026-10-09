import path from 'path';
import { Pool } from 'pg';
import { execSync } from 'child_process';
import { DisposableStack, type IDisposableStackEndpoints } from '../disposable-stack';
import { startFixtureServer, IFixtureServer } from '../fixture-server';
import { seedFixtureData, ISeedResult } from '../db-seed';
import { startBackendService, IBackendService } from '../backend-service';
import { launchBrowserHarness, IBrowserHarness } from '../browser-harness';

/**
 * E2E MinIO bucket publik tanpa signature (docs/qa/minio-public-read/test-matrix.md).
 */

const projectRoot = path.resolve(__dirname, '../../../../');
const UUID_WEBM = /^sessions\/\d+\/video\/[0-9a-f-]{36}\.webm$/;

describe('MinIO bucket publik tanpa signature (test-matrix PB-1..PB-4)', () => {
	jest.setTimeout(300000);

	let stack: DisposableStack;
	let endpoints: IDisposableStackEndpoints;
	let fixture: IFixtureServer;
	let seeded: ISeedResult;
	let backend: IBackendService;
	let harness: IBrowserHarness;
	let pool: Pool;
	let token = '';
	let webm: Buffer;
	let minioBase = '';
	let sessionId = 0;
	let videoUrl = '';
	let shareToken = '';

	const api = async (method: string, url: string, body?: unknown, base = backend.baseUrl) => {
		const res = await fetch(`${base}${url}`, {
			method,
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-request-id': `${Date.now()}-${Math.random()}` },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		const text = await res.text();
		let json: any = null;
		try {
			json = JSON.parse(text);
		} catch {
			json = text;
		}
		return { status: res.status, json, result: json?.result };
	};

	const migrate = () =>
		execSync(`pnpm exec tsx "${path.join(projectRoot, 'scripts/migrate.ts')}"`, {
			env: {
				...process.env,
				POSTGRES_HOST: endpoints.postgres.host,
				POSTGRES_PORT: String(endpoints.postgres.port),
				POSTGRES_USER: endpoints.postgres.user,
				POSTGRES_PASSWORD: endpoints.postgres.pass,
				POSTGRES_DB: endpoints.postgres.db
			},
			encoding: 'utf-8'
		});

	const createSession = async (title: string) => {
		const res = await api('POST', '/sessions', {
			id_project: seeded.project.id,
			test_case_no: `TC-MINIO-${Date.now()}`,
			title,
			target_url: fixture.baseUrl,
			force_end_previous: true
		});
		expect(res.status).toBe(201);
		return Number(res.result.id_session);
	};

	/** Video webm asli (MediaRecorder dari canvas) supaya `<video>` benar-benar bisa memuat metadata. */
	const recordWebm = async (): Promise<Buffer> => {
		await harness.page.goto(`${fixture.baseUrl}/checkout`, { waitUntil: 'domcontentloaded' });
		const b64 = await harness.page.evaluate(async () => {
			const canvas = document.createElement('canvas');
			canvas.width = 160;
			canvas.height = 120;
			const ctx = canvas.getContext('2d')!;
			const stream = canvas.captureStream(15);
			const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
			const chunks: Blob[] = [];
			rec.ondataavailable = (e) => chunks.push(e.data);
			let frame = 0;
			const timer = setInterval(() => {
				ctx.fillStyle = `hsl(${(frame++ * 20) % 360}, 80%, 50%)`;
				ctx.fillRect(0, 0, 160, 120);
			}, 60);
			rec.start(200);
			await new Promise((r) => setTimeout(r, 1200));
			const done = new Promise((r) => (rec.onstop = r));
			rec.stop();
			await done;
			clearInterval(timer);
			const buf = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
			let bin = '';
			for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
			return btoa(bin);
		});
		return Buffer.from(b64, 'base64');
	};

	/** Status `<video>` di halaman: memuat metadata (readyState >= 1) atau error. */
	const videoState = (selector = 'video') =>
		harness.page.evaluate(async (sel) => {
			const v = document.querySelector(sel) as HTMLVideoElement | null;
			if (!v) return { found: false, readyState: 0, error: null as number | null, src: '' };
			for (let i = 0; i < 100 && v.readyState < 1 && !v.error; i++) await new Promise((r) => setTimeout(r, 100));
			return { found: true, readyState: v.readyState, error: v.error ? v.error.code : null, src: v.currentSrc || v.src };
		}, selector);

	beforeAll(async () => {
		stack = new DisposableStack();
		endpoints = await stack.start();
		migrate();
		fixture = await startFixtureServer();
		pool = new Pool({
			host: endpoints.postgres.host,
			port: endpoints.postgres.port,
			user: endpoints.postgres.user,
			password: endpoints.postgres.pass,
			database: endpoints.postgres.db
		});
		seeded = await seedFixtureData(pool, { baseUrl: fixture.baseUrl });
		backend = await startBackendService(endpoints);
		minioBase = `http://${endpoints.minio.host}:${endpoints.minio.port}/${endpoints.minio.bucket}`;
		const login = await fetch(`${backend.baseUrl}/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username: seeded.user.username, password: seeded.user.passwordPlain })
		});
		token = JSON.stringify(await login.json()).match(/"(?:access_)?token"\s*:\s*"([^"]+)"/)?.[1] ?? '';
		harness = await launchBrowserHarness({ apiBaseUrl: backend.baseUrl, headless: true });
		webm = await recordWebm();
	});

	afterAll(async () => {
		await harness?.close().catch(() => undefined);
		await backend?.stop().catch(() => undefined);
		await fixture?.stop().catch(() => undefined);
		await pool?.end().catch(() => undefined);
		await stack?.stop().catch(() => undefined);
	});

	// ---------------------------------------------------------------- PB-1 infra
	it('TC1-1: bucket E2E public read+write — PUT/GET/DELETE anonim tanpa signature', async () => {
		const url = `${minioBase}/_probe/anon.txt`;
		expect((await fetch(url, { method: 'PUT', body: 'halo' })).status).toBe(200);
		const get = await fetch(url);
		expect(get.status).toBe(200);
		expect(await get.text()).toBe('halo');
		expect((await fetch(url, { method: 'DELETE' })).status).toBe(204);
	});

	// ---------------------------------------------------------------- PB-2 upload & baca video
	it('TC2-1: presign video → PUT ke upload_url tanpa signature → complete → video_url publik bisa diunduh & di-seek', async () => {
		expect(webm.length).toBeGreaterThan(500);
		sessionId = await createSession('Sesi video publik');

		const presign = await api('POST', `/sessions/${sessionId}/video/presign-upload`, { size_bytes: webm.length, content_type: 'video/webm' });
		expect(presign.status).toBe(201);
		const { upload_url, object_key } = presign.result;
		expect(object_key).toMatch(UUID_WEBM);
		expect(object_key.startsWith(`sessions/${sessionId}/video/`)).toBe(true);
		expect(upload_url).toBe(`${minioBase}/${object_key}`);
		expect(upload_url).not.toMatch(/X-Amz-/);

		const put = await fetch(upload_url, { method: 'PUT', body: webm, headers: { 'Content-Type': 'video/webm' } });
		expect(put.status).toBe(200);

		const complete = await api('POST', `/sessions/${sessionId}/video/complete`, { object_key });
		expect(complete.status).toBeLessThan(300);
		videoUrl = complete.result.video_url;
		expect(videoUrl).toBe(upload_url);

		const db = await pool.query('SELECT video_object_key FROM recording_sessions WHERE id_session = $1', [sessionId]);
		expect(db.rows[0].video_object_key).toBe(object_key);

		const detail = await api('GET', `/sessions/${sessionId}`);
		expect(detail.result.video_url).toBe(videoUrl);
		expect((await api('GET', `/sessions/${sessionId}/video`)).result.video_url).toBe(videoUrl);

		const full = await fetch(videoUrl);
		expect(full.status).toBe(200);
		expect(Buffer.from(await full.arrayBuffer()).equals(webm)).toBe(true);
		const ranged = await fetch(videoUrl, { headers: { Range: 'bytes=0-99' } });
		expect(ranged.status).toBe(206);
		expect((await ranged.arrayBuffer()).byteLength).toBe(100);
	});

	it('TC2-2: complete menolak key format lama / milik sesi lain', async () => {
		for (const object_key of [`sessions/${seeded.project.id}/${sessionId}-video-123.webm`, 'sessions/999999/video/0f8fad5b-d9cb-469f-a165-70867728950e.webm']) {
			const res = await api('POST', `/sessions/${sessionId}/video/complete`, { object_key });
			expect(res.status).toBe(400);
			expect(JSON.stringify(res.json)).toContain('Object key tidak valid untuk sesi ini.');
		}
	});

	it('TC2-3: complete menolak bila objek belum terunggah (statObject tetap jalan)', async () => {
		const presign = await api('POST', `/sessions/${sessionId}/video/presign-upload`, { size_bytes: 10 });
		const res = await api('POST', `/sessions/${sessionId}/video/complete`, { object_key: presign.result.object_key });
		expect(res.status).toBe(400);
		expect(JSON.stringify(res.json)).toContain('belum berhasil terunggah');
	});

	// ---------------------------------------------------------------- PB-2 artifact
	it('TC3-1: artifact screenshot — upload ke URL publik, complete, download_url publik tanpa signature', async () => {
		const artSession = await createSession('Sesi artifact publik');
		const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
		const presign = await api('POST', `/sessions/${artSession}/artifacts/presign-upload`, { kind: 'screenshot', content_type: 'image/png', size_bytes: png.length });
		expect(presign.status).toBe(201);
		expect(presign.result.upload_url).toBe(`${minioBase}/${presign.result.object_key}`);
		expect(presign.result.upload_url).not.toMatch(/X-Amz-/);

		expect((await fetch(presign.result.upload_url, { method: 'PUT', body: png, headers: { 'Content-Type': 'image/png' } })).status).toBe(200);
		const idArtifact = presign.result.artifact.id_artifact;
		expect((await api('POST', `/sessions/${artSession}/artifacts/${idArtifact}/complete`, { size_bytes: png.length })).status).toBeLessThan(300);

		const dl = await api('GET', `/sessions/${artSession}/artifacts/${idArtifact}/download-url`);
		expect(dl.status).toBe(200);
		expect(dl.result.download_url).toBe(presign.result.upload_url);
		const got = await fetch(dl.result.download_url);
		expect(got.status).toBe(200);
		expect(Buffer.from(await got.arrayBuffer()).equals(png)).toBe(true);
		await api('POST', `/sessions/${artSession}/end`, { result: 'PASS' });
	});

	// ---------------------------------------------------------------- PB-3 share page & stream API
	it('TC4-1: halaman share memutar video langsung dari MinIO (bukan /share/:token/video)', async () => {
		const share = await api('POST', `/sessions/${sessionId}/share`, {});
		expect(share.status).toBeLessThan(300);
		shareToken = share.result.share_token;

		await harness.page.goto(`${backend.baseUrl}/share/${shareToken}`, { waitUntil: 'domcontentloaded' });
		const state = await videoState('video');
		expect(state).toMatchObject({ found: true, error: null, src: videoUrl });
		expect(state.readyState).toBeGreaterThanOrEqual(1);
		const html = await harness.page.content();
		expect(html).not.toContain(`/share/${shareToken}/video`);
		expect(html).not.toContain('X-Amz-');
	});

	it('TC4-2: route stream API sudah dihapus → 404', async () => {
		const stream = await fetch(`${backend.baseUrl}/sessions/${sessionId}/video/stream`, { headers: { Authorization: `Bearer ${token}` } });
		expect(stream.status).toBe(404);
		const streamV1 = await fetch(`${backend.baseUrl}/api/v1/sessions/${sessionId}/video/stream`, { headers: { Authorization: `Bearer ${token}` } });
		expect(streamV1.status).toBe(404);
		const shareVideo = await fetch(`${backend.baseUrl}/share/${shareToken}/video`);
		expect(shareVideo.status).toBe(404);
	});

	it('TC4-3: tanpa token, /sessions/:id/video/stream tidak lagi dikecualikan dari auth (401)', async () => {
		const res = await fetch(`${backend.baseUrl}/sessions/${sessionId}/video/stream`);
		expect(res.status).toBe(401);
	});

	// ---------------------------------------------------------------- PB-4 data lama & konfigurasi
	it('TC5-1: sesi lama dengan video_url presigned kedaluwarsa tetap bisa diputar setelah migration 003 (backfill)', async () => {
		const legacyId = await createSession('Sesi lama presigned');
		await api('POST', `/sessions/${legacyId}/end`, { result: 'PASS' });
		const legacyKey = `sessions/${seeded.project.id}/${legacyId}-video-1700000000000.webm`;
		// Objek lama di key format lama + URL presigned yang sudah kedaluwarsa (host lama, signature basi).
		expect((await fetch(`${minioBase}/${legacyKey}`, { method: 'PUT', body: webm, headers: { 'Content-Type': 'video/webm' } })).status).toBe(200);
		const expired = `http://127.0.0.1:9000/qa-recording-artifacts/${legacyKey}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20240101T000000Z&X-Amz-Expires=604800&X-Amz-Signature=deadbeef`;
		await pool.query('UPDATE recording_sessions SET video_url = $1, video_object_key = NULL WHERE id_session = $2', [expired, legacyId]);

		// Simulasikan database yang belum menjalankan 003: hapus riwayatnya lalu jalankan migrate lagi.
		await pool.query("DELETE FROM schema_migrations WHERE version = '003_recording_session_video_object_key.sql'");
		const out = migrate();
		expect(out).toContain('Applying 003_recording_session_video_object_key.sql');

		const db = await pool.query('SELECT video_object_key FROM recording_sessions WHERE id_session = $1', [legacyId]);
		expect(db.rows[0].video_object_key).toBe(legacyKey);
		// Sesi baru (TC2-1) tidak tertimpa backfill.
		const fresh = await pool.query('SELECT video_object_key FROM recording_sessions WHERE id_session = $1', [sessionId]);
		expect(fresh.rows[0].video_object_key).toMatch(UUID_WEBM);

		const detail = await api('GET', `/sessions/${legacyId}`);
		expect(detail.result.video_url).toBe(`${minioBase}/${legacyKey}`);
		const got = await fetch(detail.result.video_url);
		expect(got.status).toBe(200);
		expect(Buffer.from(await got.arrayBuffer()).equals(webm)).toBe(true);
	});

	it('TC5-2: mengganti MINIO_PUBLIC_BASE_URL langsung mengubah video_url tanpa migrasi data', async () => {
		const altBase = `http://localhost:${endpoints.minio.port}/`;
		const alt = await startBackendService(endpoints, { extraEnv: { MINIO_PUBLIC_BASE_URL: altBase } });
		try {
			const res = await api('GET', `/sessions/${sessionId}`, undefined, alt.baseUrl);
			expect(res.status).toBe(200);
			const key = (await pool.query('SELECT video_object_key FROM recording_sessions WHERE id_session = $1', [sessionId])).rows[0].video_object_key;
			expect(res.result.video_url).toBe(`http://localhost:${endpoints.minio.port}/${endpoints.minio.bucket}/${key}`);
			expect((await fetch(res.result.video_url)).status).toBe(200);
		} finally {
			await alt.stop();
		}
	});

	// ---------------------------------------------------------------- PB-4 extension
	it('TC6-1: extension media:fetchBlobUrl memuat video_url publik langsung (tanpa rewrite host / stream API)', async () => {
		const worker = harness.context.serviceWorkers()[0];
		const extensionId = new URL(worker.url()).host;
		const page = await harness.context.newPage();
		try {
			await page.goto(`chrome-extension://${extensionId}/status.html`);
			const res = await page.evaluate(
				(url) =>
					new Promise<{ success: boolean; dataUrl?: string; error?: string }>((resolve) =>
						(globalThis as any).chrome.runtime.sendMessage({ type: 'media:fetchBlobUrl', url }, resolve)
					),
				videoUrl
			);
			expect(res.success).toBe(true);
			expect(res.dataUrl).toMatch(/^data:video\/webm/);
			const payload = Buffer.from(res.dataUrl!.split(',')[1], 'base64');
			expect(payload.equals(webm)).toBe(true);

			const missing = await page.evaluate(
				(url) =>
					new Promise<{ success: boolean }>((resolve) =>
						(globalThis as any).chrome.runtime.sendMessage({ type: 'media:fetchBlobUrl', url }, resolve)
					),
				`${minioBase}/sessions/0/video/tidak-ada.webm`
			);
			expect(missing.success).toBe(false);
		} finally {
			await page.close();
		}
	});
});
