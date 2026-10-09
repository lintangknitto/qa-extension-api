import path from 'path';
import { Pool } from 'pg';
import { execSync } from 'child_process';
import type { Page, Worker } from '@playwright/test';
import { DisposableStack, type IDisposableStackEndpoints } from '../disposable-stack';
import { startFixtureServer, IFixtureServer } from '../fixture-server';
import { seedFixtureData, ISeedResult } from '../db-seed';
import { startBackendService, IBackendService } from '../backend-service';
import { launchBrowserHarness, IBrowserHarness } from '../browser-harness';

declare const chrome: any;

/**
 * E2E video multi-tab, riwayat re-run, file test data, dan HUD replay
 * (docs/qa/multi-tab-video-and-run-history/test-matrix.md). Extension asli dimuat di Chromium;
 * rekaman/replay dipicu lewat pesan runtime yang sama dengan FAB.
 */

const projectRoot = path.resolve(__dirname, '../../../../');
const NAMED_VIDEO_KEY = /^sessions\/\d+\/video\/[0-9a-f-]{36}\/(.+ - Run (\d+)\.webm)$/;

describe('Video multi-tab & riwayat re-run (test-matrix PB-1..PB-5)', () => {
	jest.setTimeout(600000);

	let stack: DisposableStack;
	let endpoints: IDisposableStackEndpoints;
	let fixture: IFixtureServer;
	let seeded: ISeedResult;
	let backend: IBackendService;
	let harness: IBrowserHarness;
	let pool: Pool;
	let token = '';
	let control: Page;
	let multiTabSessionId = 0;
	let run1Key = '';

	const api = async (method: string, url: string, body?: unknown) => {
		const res = await fetch(`${backend.baseUrl}${url}`, {
			method,
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

	/** Pesan ke service worker extension, dikirim dari halaman extension (sama seperti FAB/UI). */
	const sendToExtension = <T = any>(message: Record<string, unknown>): Promise<T> =>
		control.evaluate((msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve)), message) as Promise<T>;

	const tabIdOf = (urlPattern: string): Promise<number> =>
		control.evaluate(async (pattern) => {
			const tabs = await chrome.tabs.query({ url: pattern });
			return tabs[0]?.id as number;
		}, urlPattern);

	const createSession = async (title: string, testCaseNo = `TC-RUN-${Date.now()}`) => {
		const res = await api('POST', '/sessions', {
			id_project: seeded.project.id,
			id_test_case: seeded.testCase.id,
			test_case_no: testCaseNo,
			title,
			target_url: fixture.baseUrl,
			force_end_previous: true
		});
		expect(res.status).toBe(201);
		return Number(res.result.id_session);
	};

	const endSession = async (idSession: number, result = 'PASS') => {
		const res = await api('POST', `/sessions/${idSession}/end`, { result, actual_result: `hasil ${result}` });
		expect(res.status).toBe(200);
	};

	const openPage = async (url: string): Promise<Page> => {
		const page = await harness.context.newPage();
		await page.goto(url, { waitUntil: 'domcontentloaded' });
		return page;
	};

	/**
	 * Putar video di dokumennya sendiri (origin MinIO, canvas tidak tainted) dan klasifikasikan warna tengah
	 * frame tiap 150ms. Fixture tab A merah, tab B biru.
	 */
	const sampleVideoColors = async (videoUrl: string): Promise<string[]> => {
		const page = await openPage(videoUrl);
		try {
			return await page.evaluate(async () => {
				const video = document.querySelector('video') as HTMLVideoElement;
				video.muted = true;
				video.pause();
				video.currentTime = 0;
				await video.play();
				const canvas = document.createElement('canvas');
				const ctx = canvas.getContext('2d')!;
				const seen: string[] = [];
				const started = Date.now();
				while (!video.ended && Date.now() - started < 30000) {
					if (video.videoWidth > 0) {
						canvas.width = video.videoWidth;
						canvas.height = video.videoHeight;
						ctx.drawImage(video, 0, 0);
						const [r, g, b] = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.75), 1, 1).data;
						const color = r > 150 && g < 90 && b < 90 ? 'red' : b > 150 && r < 90 && g < 90 ? 'blue' : 'other';
						if (seen[seen.length - 1] !== color) seen.push(color);
					}
					await new Promise((resolve) => setTimeout(resolve, 150));
				}
				return seen;
			});
		} finally {
			await page.close();
		}
	};

	const replay = (idSession: number, script: string, extra: Record<string, unknown> = {}) =>
		sendToExtension<any>({
			type: 'replay:run',
			options: {
				sessionId: idSession,
				testCaseNo: `TC-REPLAY-${idSession}`,
				script,
				parameterOverrides: {},
				mode: 'tabGroup',
				stepDelayMs: 1500,
				apiBaseUrl: backend.baseUrl,
				...extra
			}
		});

	beforeAll(async () => {
		stack = new DisposableStack();
		endpoints = await stack.start();
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
		const login = await fetch(`${backend.baseUrl}/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username: seeded.user.username, password: seeded.user.passwordPlain })
		});
		token = JSON.stringify(await login.json()).match(/"(?:access_)?token"\s*:\s*"([^"]+)"/)?.[1] ?? '';
		harness = await launchBrowserHarness({ apiBaseUrl: backend.baseUrl, headless: process.env.E2E_HEADED !== '1' });

		const worker: Worker = harness.context.serviceWorkers()[0] ?? (await harness.context.waitForEvent('serviceworker'));
		const extensionId = new URL(worker.url()).host;
		await worker.evaluate(
			async ({ url, t }) => chrome.storage.local.set({ qa_recording_base_url: url, qa_recording_token: t }),
			{ url: backend.baseUrl, t: token }
		);
		control = await openPage(`chrome-extension://${extensionId}/status.html`);
	});

	afterAll(async () => {
		await harness?.close().catch(() => undefined);
		await backend?.stop().catch(() => undefined);
		await fixture?.stop().catch(() => undefined);
		await pool?.end().catch(() => undefined);
		await stack?.stop().catch(() => undefined);
	});

	// ------------------------------------------------------------ PB-1 video multi-tab
	it('TC1-1: rekam 2 tab dalam group → satu video mengikuti tab aktif, event tab switch, key bernama', async () => {
		multiTabSessionId = await createSession('Bayar di tab baru', 'TC-MULTI-01');
		const tabA = await openPage(`${fixture.baseUrl}/color/red`);
		const tabAId = await tabIdOf(`${fixture.baseUrl}/color/red`);

		const started = await sendToExtension({
			type: 'recordingStart',
			idSession: multiTabSessionId,
			apiBaseUrl: backend.baseUrl,
			tabIds: [tabAId],
			recordVideo: true
		});
		expect(started).toMatchObject({ success: true });

		await tabA.bringToFront();
		await tabA.waitForTimeout(2500);
		const [tabB] = await Promise.all([harness.context.waitForEvent('page'), tabA.click('#open-blue')]);
		await tabB.waitForLoadState('domcontentloaded');
		await tabB.bringToFront();
		await tabB.waitForTimeout(2500);
		await tabA.bringToFront();
		await tabA.waitForTimeout(2500);

		const stopped = await sendToExtension<any>({ type: 'recordingStop' });
		expect(stopped.success).toBe(true);
		expect(stopped.videoUrl).toBeTruthy();
		await endSession(multiTabSessionId);

		const { rows: [session] } = await pool.query<{ video_object_key: string }>(
			'SELECT video_object_key FROM recording_sessions WHERE id_session = $1',
			[multiTabSessionId]
		);
		run1Key = session.video_object_key;
		const match = run1Key.match(NAMED_VIDEO_KEY);
		expect(match?.[1]).toMatch(/^TC-MULTI-01 - Bayar di tab baru - \d{4}-\d{2}-\d{2} \d{2}\.\d{2} - Run 1\.webm$/);

		const { rows: switches } = await pool.query<{ payload: any }>(
			"SELECT payload FROM recording_events WHERE id_session = $1 AND event_type = 'tab' ORDER BY sequence",
			[multiTabSessionId]
		);
		const payloads = switches.map((row) => (typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload));
		// Tab baru masih loading saat diaktifkan: judul bisa kosong, URL tujuan tetap tercatat.
		const switchTargets = payloads.filter((p) => p.kind === 'switch').map((p) => p.title || p.url);
		expect(switchTargets).toHaveLength(2);
		expect(switchTargets[0]).toMatch(/Tab #0000ff|\/color\/blue$/);
		expect(switchTargets[1]).toBe('Tab #ff0000');

		const colors = await sampleVideoColors(stopped.videoUrl);
		console.log('[E2E] urutan warna video Run #1:', colors.join(' → '));
		const firstRed = colors.indexOf('red');
		const blue = colors.indexOf('blue', firstRed);
		expect(firstRed).toBeGreaterThanOrEqual(0);
		expect(blue).toBeGreaterThan(firstRed);
		expect(colors.indexOf('red', blue)).toBeGreaterThan(blue);

		await tabB.close();
		await tabA.close();
	});

	// ------------------------------------------------------------ PB-2 riwayat re-run
	it('TC2-1: replay → Run #2 dengan video sendiri, Run #1 utuh, hasil sesi & status test case ikut Run #2', async () => {
		const res = await replay(
			multiTabSessionId,
			[`await page.goto('${fixture.baseUrl}/color/red');`, "await page.locator('#tidak-ada-tombol').click();"].join('\n'),
			{ stepDelayMs: 300 }
		);
		expect(res.result.success).toBe(false);
		expect(res.run).toMatchObject({ run_number: 2, kind: 'rerun', result: 'FAIL' });
		expect(res.run.video_url).toBeTruthy();

		const runs = await api('GET', `/sessions/${multiTabSessionId}/runs`);
		expect(runs.result.map((run: any) => [run.run_number, run.kind, run.result])).toEqual([
			[1, 'original', 'PASS'],
			[2, 'rerun', 'FAIL']
		]);
		const run2Key = decodeURIComponent(new URL(runs.result[1].video_url).pathname).split(`/${endpoints.minio.bucket}/`)[1];
		expect(run2Key).toMatch(NAMED_VIDEO_KEY);
		expect(run2Key.match(NAMED_VIDEO_KEY)?.[2]).toBe('2');
		expect(runs.result[1].video_file_name).toMatch(/ - Run 2\.webm$/);

		const { rows: [session] } = await pool.query<{ video_object_key: string; result: string }>(
			'SELECT video_object_key, result FROM recording_sessions WHERE id_session = $1',
			[multiTabSessionId]
		);
		expect(session.video_object_key).toBe(run1Key);
		expect(session.result).toBe('FAIL');
		const { rows: [testCase] } = await pool.query<{ status: string }>('SELECT status FROM test_cases WHERE id_test_case = $1', [seeded.testCase.id]);
		expect(testCase.status).toBe('Failed');

		// Detail sesi (yang dibaca modal setelah dibuka ulang) tetap memuat kedua run.
		const detail = await api('GET', `/sessions/${multiTabSessionId}`);
		expect(detail.result.runs).toHaveLength(2);
	});

	it('TC2-2: replay yang membuka tab baru → video Run #3 berisi frame kedua tab', async () => {
		const res = await replay(
			multiTabSessionId,
			[`await page.goto('${fixture.baseUrl}/color/red');`, "await page.locator('#open-blue').click();", "await page.locator('#open-blue').waitFor();"].join('\n')
		);
		expect(res.result.success).toBe(true);
		expect(res.run).toMatchObject({ run_number: 3, result: 'PASS' });
		const colors = await sampleVideoColors(res.run.video_url);
		console.log('[E2E] urutan warna video Run #3:', colors.join(' → '));
		expect(colors).toEqual(expect.arrayContaining(['red', 'blue']));
		expect(colors.indexOf('blue')).toBeGreaterThan(colors.indexOf('red'));

		const { rows: [session] } = await pool.query<{ result: string }>('SELECT result FROM recording_sessions WHERE id_session = $1', [multiTabSessionId]);
		expect(session.result).toBe('PASS');
		for (const page of harness.context.pages()) if (page !== control) await page.close();
	});

	// ------------------------------------------------------------ PB-3 halaman share
	it('TC3-1: halaman share menampilkan tab run, video tiap run bisa diputar, Download bernama sesuai format', async () => {
		const share = await api('POST', `/sessions/${multiTabSessionId}/share`);
		expect(share.status).toBe(200);
		const runs = (await api('GET', `/sessions/${multiTabSessionId}/runs`)).result;
		const page = await openPage(`${backend.baseUrl}/share/${share.result.share_token}`);

		for (const run of runs) {
			await expect(page.locator(`#run-tab-${run.run_number}`).textContent()).resolves.toContain(`Run #${run.run_number}`);
			await page.click(`#run-tab-${run.run_number}`);
			const state = await page.evaluate(async (n) => {
				const video = document.querySelector(`#run-panel-${n} video`) as HTMLVideoElement;
				for (let i = 0; i < 100 && video.readyState < 1 && !video.error; i++) await new Promise((r) => setTimeout(r, 100));
				return { readyState: video.readyState, error: video.error?.code ?? null };
			}, run.run_number);
			expect(state).toEqual({ readyState: expect.any(Number), error: null });
			expect(state.readyState).toBeGreaterThanOrEqual(1);
		}

		await page.click('#run-tab-1');
		const [download] = await Promise.all([page.waitForEvent('download'), page.click('#run-panel-1 .run-download')]);
		expect(download.suggestedFilename()).toBe(runs[0].video_file_name);

		const html = await page.content();
		expect(html).toContain('Perpindahan Tab');
		expect(html).toMatch(/Pindah ke tab: (Tab #0000ff|127\.0\.0\.1:\d+)/);
		expect(html).toContain('Pindah ke tab: Tab #ff0000');
		await page.close();
	});

	// ------------------------------------------------------------ PB-4 file test data
	it('TC4-1: rekam upload file → re-run memasang file yang sama tanpa input manual', async () => {
		const idSession = await createSession('Upload lampiran', 'TC-UPLOAD-01');
		const uploadPage = await openPage(`${fixture.baseUrl}/upload`);
		const tabId = await tabIdOf(`${fixture.baseUrl}/upload`);
		expect(await sendToExtension({ type: 'recordingStart', idSession, apiBaseUrl: backend.baseUrl, tabIds: [tabId], recordVideo: false })).toMatchObject({ success: true });

		await uploadPage.waitForTimeout(1000);
		const csv = 'kode,nama\nCC30,Cotton Combed 30s\n';
		await uploadPage.setInputFiles('#lampiran', { name: 'data kain.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
		await uploadPage.locator('#upload-status').filter({ hasText: 'data kain.csv' }).waitFor();

		let files: any[] = [];
		for (let i = 0; i < 20 && files.length === 0; i++) {
			files = (await api('GET', `/sessions/${idSession}/test-data-files`)).result;
			if (files.length === 0) await uploadPage.waitForTimeout(500);
		}
		expect(await sendToExtension({ type: 'recordingStop' })).toMatchObject({ success: true });
		await endSession(idSession);

		expect(files).toEqual([expect.objectContaining({ file_name: 'data kain.csv', content_type: 'text/csv', size_bytes: csv.length })]);
		const { rows: [uploadEvent] } = await pool.query<{ sequence: string; payload: any }>(
			"SELECT sequence, payload FROM recording_events WHERE id_session = $1 AND payload->>'action' = 'upload'",
			[idSession]
		);
		expect(Number(uploadEvent.sequence)).toBe(files[0].sequence);
		expect(JSON.stringify(uploadEvent.payload)).not.toContain(Buffer.from(csv).toString('base64'));

		const codegen = await api('POST', `/sessions/${idSession}/generations`, { kinds: ['playwright'] });
		expect(codegen.status).toBeLessThan(300);
		const generations = await api('GET', `/sessions/${idSession}/generations`);
		const script: string = (generations.result.items ?? generations.result).find((g: any) => g.kind === 'playwright').output;
		expect(script).toContain("setInputFiles(['test-data/data kain.csv'])");
		expect(script).toContain(`artifact #${files[0].id_artifact}`);

		await uploadPage.close();
		const res = await replay(idSession, script, { stepDelayMs: 800 });
		expect(res.result).toMatchObject({ success: true });
		expect(fixture.lastUpload()).toEqual({ name: 'data kain.csv', type: 'text/csv', data: Buffer.from(csv).toString('base64') });
		for (const page of harness.context.pages()) if (page !== control) await page.close();
	});

	it('TC4-2: rekaman lama tanpa file → replay gagal jelas; file pengganti dikaitkan → re-run berikutnya otomatis', async () => {
		const idSession = await createSession('Upload lama', 'TC-UPLOAD-LAMA');
		await endSession(idSession);
		const script = [`await page.goto('${fixture.baseUrl}/upload');`, "await page.getByLabel('Lampiran').setInputFiles(['test-data/lama.csv']);"].join('\n');

		const failed = await replay(idSession, script, { stepDelayMs: 300 });
		expect(failed.result.success).toBe(false);
		expect(failed.result.error).toBe('File test data untuk langkah upload tidak tersedia: lama.csv. Pilih file pengganti di modal Re-run.');

		// Alur yang sama dengan "Pilih file pengganti" di modal Re-run (apiClient.uploadReplacementTestData).
		const replacement = Buffer.from('isi pengganti');
		const presign = await api('POST', `/sessions/${idSession}/artifacts/presign-upload`, {
			kind: 'test_data_file',
			content_type: 'text/plain',
			size_bytes: replacement.length,
			file_name: 'lama.csv'
		});
		expect(presign.status).toBe(201);
		const put = await fetch(presign.result.upload_url, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: replacement });
		expect(put.status).toBe(200);
		await api('POST', `/sessions/${idSession}/artifacts/${presign.result.artifact.id_artifact}/complete`, { size_bytes: replacement.length });
		const linked = await api('PUT', `/sessions/${idSession}/test-data-files`, {
			files: [{ id_artifact: presign.result.artifact.id_artifact, file_name: 'lama.csv' }]
		});
		expect(linked.result).toEqual([expect.objectContaining({ file_name: 'lama.csv' })]);

		const ok = await replay(idSession, script, { stepDelayMs: 800 });
		expect(ok.result.success).toBe(true);
		expect(fixture.lastUpload()).toEqual({ name: 'lama.csv', type: 'text/plain', data: replacement.toString('base64') });
		for (const page of harness.context.pages()) if (page !== control) await page.close();
	});

	// ------------------------------------------------------------ PB-5 HUD replay
	it('TC5-1: HUD error replay bisa ditutup ✕ dan hilang sendiri setelah 10 detik', async () => {
		const failingScript = [`await page.goto('${fixture.baseUrl}/checkout');`, "await page.locator('#tidak-ada').click();"].join('\n');
		const replayPage = async () => {
			const res = await replay(multiTabSessionId, failingScript, { stepDelayMs: 200 });
			expect(res.result.success).toBe(false);
			const page = harness.context.pages().find((p) => p.url().startsWith(`${fixture.baseUrl}/checkout`))!;
			await page.locator('#knitto-replay-hud').waitFor({ state: 'attached' });
			return page;
		};

		const first = await replayPage();
		await expect(first.locator('#knitto-replay-hud').textContent()).resolves.toContain('Replay Terhenti (Gagal)');
		await first.click('#knitto-replay-hud button[aria-label="Tutup"]');
		expect(await first.locator('#knitto-replay-hud').count()).toBe(0);
		await first.close();

		const second = await replayPage();
		await second.waitForTimeout(9000);
		expect(await second.locator('#knitto-replay-hud').count()).toBe(1);
		await second.waitForTimeout(2000);
		expect(await second.locator('#knitto-replay-hud').count()).toBe(0);
		await second.close();
	});
});
