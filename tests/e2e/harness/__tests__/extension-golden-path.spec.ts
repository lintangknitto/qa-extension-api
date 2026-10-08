import path from 'path';
import { Pool } from 'pg';
import { execSync } from 'child_process';
import * as Minio from 'minio';
import { DisposableStack } from '../disposable-stack';
import { startFixtureServer, IFixtureServer } from '../fixture-server';
import { seedFixtureData, ISeedResult } from '../db-seed';
import { startBackendService, IBackendService } from '../backend-service';
import { launchBrowserHarness, IBrowserHarness } from '../browser-harness';

declare const chrome: any;

describe('PostgreSQL Recorder E2E Golden Path (Checkpoints 3 & 4)', () => {
	// E2E browser run membutuhkan waktu untuk boot, navigasi, dan background processing
	jest.setTimeout(180000);

	let stack: DisposableStack;
	let endpoints: ReturnType<DisposableStack['getEndpoints']>;
	let fixture: IFixtureServer;
	let seeded: ISeedResult;
	let backend: IBackendService;
	let harness: IBrowserHarness;
	let pool: Pool;
	let minioClient: Minio.Client;

	beforeAll(async () => {
		// 1. Start disposable infrastructure
		stack = new DisposableStack();
		endpoints = await stack.start();

		// 2. Run migrations
		const migrateScriptPath = path.resolve(__dirname, '../../../../scripts/migrate.ts');
		execSync(`pnpm exec tsx "${migrateScriptPath}"`, {
			env: {
				...process.env,
				POSTGRES_HOST: endpoints.postgres.host,
				POSTGRES_PORT: String(endpoints.postgres.port),
				POSTGRES_USER: endpoints.postgres.user,
				POSTGRES_PASSWORD: endpoints.postgres.pass,
				POSTGRES_DB: endpoints.postgres.db
			},
			stdio: 'pipe'
		});

		// 3. Start local fixture web server
		fixture = await startFixtureServer();

		// 4. Seed database with QA user, program, project, test case
		pool = new Pool({
			host: endpoints.postgres.host,
			port: endpoints.postgres.port,
			user: endpoints.postgres.user,
			password: endpoints.postgres.pass,
			database: endpoints.postgres.db
		});
		seeded = await seedFixtureData(pool, { baseUrl: fixture.baseUrl });

		// 5. Start backend API service connected to disposable stack
		backend = await startBackendService(endpoints);

		// 6. Init Minio client
		minioClient = new Minio.Client({
			endPoint: endpoints.minio.host,
			port: endpoints.minio.port,
			useSSL: false,
			accessKey: endpoints.minio.accessKey,
			secretKey: endpoints.minio.secretKey
		});

		// 7. Launch browser with unpacked extension & temporary profile
		harness = await launchBrowserHarness({
			apiBaseUrl: backend.baseUrl,
			headless: true
		});
	});

	afterAll(async () => {
		if (harness) {
			await harness.close().catch(() => undefined);
		}
		if (backend) {
			await backend.stop().catch(() => undefined);
		}
		if (fixture) {
			await fixture.stop().catch(() => undefined);
		}
		if (pool) {
			await pool.end().catch(() => undefined);
		}
		if (stack) {
			await stack.stop().catch(() => undefined);
		}
	});

	it('3.1, 3.2, 3.3: Login extension, mulai recording, interaksi di fixture page', async () => {
		const { page } = harness;

		page.on('console', (msg) => console.log('[BROWSER CONSOLE]', msg.type(), msg.text()));
		page.on('pageerror', (err) => console.log('[BROWSER ERR]', err));

		// Buka fixture web application
		await page.goto(fixture.baseUrl, { waitUntil: 'domcontentloaded' });

		// Tunggu FAB element diinjeksi oleh content script
		const fabHost = page.locator('#qa-knitto-fab-host');
		await fabHost.waitFor({ state: 'attached', timeout: 15000 });

		// Buka sidebar FAB
		// Tombol floating button terletak di dalam shadowRoot
		const fabTrigger = page.locator('#qa-knitto-fab-host button[aria-label="Knitto QA Tools"]').first();
		if (await fabTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
			await fabTrigger.click();
		} else {
			// Fallback klik tombol pertama dalam host jika aria-label berbeda
			await page.locator('#qa-knitto-fab-host button').first().click();
		}

		// Otomasi Login (LoginView)
		const usernameInput = page.locator('#qa-knitto-fab-host input[placeholder*="username"]').first();
		await usernameInput.waitFor({ state: 'visible', timeout: 10000 });
		await usernameInput.fill(seeded.user.username);

		const passwordInput = page.locator('#qa-knitto-fab-host input[placeholder*="password"]').first();
		await passwordInput.fill(seeded.user.passwordPlain);

		// Pastikan storage di page/content script memiliki qa_recording_base_url yang benar
		await page.evaluate(async (url) => {
			if (typeof chrome !== 'undefined' && chrome.storage?.local) {
				await chrome.storage.local.set({ qa_recording_base_url: url });
			}
		}, backend.baseUrl);

		// Klik tombol login via locator atau DOM click
		const loginBtn = page.locator('#qa-knitto-fab-host button:has-text("Login")').first();
		await loginBtn.click();

		// Tunggu transisi ke StartView (bisa memakan waktu network login 1-2 detik)
		const startRecordingBtn = page.locator('#qa-knitto-fab-host button:has-text("Start Recording")').first();
		await startRecordingBtn.waitFor({ state: 'visible', timeout: 20000 });

		// Dump seluruh input di dalam shadowRoot
		const inputsInfo = await page.evaluate(() => {
			const host = document.getElementById('qa-knitto-fab-host');
			const inputs = Array.from(host?.shadowRoot?.querySelectorAll('input') || []);
			return inputs.map((inp) => ({
				id: inp.id,
				name: inp.name,
				type: inp.type,
				placeholder: inp.placeholder,
				value: inp.value
			}));
		});
		console.log('[SHADOW ROOT INPUTS IN START VIEW]:', JSON.stringify(inputsInfo, null, 2));

		// Isi form dan submit langsung di dalam Shadow DOM
		await page.evaluate(({ testCaseNo, title }) => {
			const host = document.getElementById('qa-knitto-fab-host');
			const sr = host?.shadowRoot;
			if (!sr) return;

			const noEl = sr.querySelector<HTMLInputElement>('#input-nomor-test-case');
			if (noEl) {
				const prototype = Object.getPrototypeOf(noEl);
				const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
				prototypeValueSetter?.call(noEl, testCaseNo);
				noEl.dispatchEvent(new Event('input', { bubbles: true }));
				noEl.dispatchEvent(new Event('change', { bubbles: true }));
			}

			const titleEl = sr.querySelector<HTMLInputElement>('#input-judul');
			if (titleEl) {
				const prototype = Object.getPrototypeOf(titleEl);
				const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
				prototypeValueSetter?.call(titleEl, title);
				titleEl.dispatchEvent(new Event('input', { bubbles: true }));
				titleEl.dispatchEvent(new Event('change', { bubbles: true }));
			}

			const chk = sr.querySelector<HTMLInputElement>('input[type="checkbox"]');
			if (chk && chk.checked) {
				chk.click();
			}

			const form = sr.querySelector('form');
			if (form) {
				form.requestSubmit();
			}
		}, { testCaseNo: seeded.testCase.testCaseNo, title: seeded.testCase.title });

		// Verifikasi masuk ke ActiveView (Recording Aktif)
		const activeBadge = page.locator('#qa-knitto-fab-host span:has-text("Recording Aktif")').first();
		await activeBadge.waitFor({ state: 'visible', timeout: 15000 });

		// Interaksi pada target web page (gunakan dispatch atau click({ force: true }) karena FAB sidebar terbuka di sisi kanan)
		const productInput = page.locator('[data-testid="product-name"]');
		await productInput.fill('Cotton Combed 30s', { force: true });

		const qtyInput = page.locator('[data-testid="quantity"]');
		await qtyInput.fill('10', { force: true });

		const submitBtn = page.locator('[data-testid="submit-btn"]');
		await submitBtn.dispatchEvent('click');

		const statusMsg = page.locator('[data-testid="status-message"]');
		await statusMsg.waitFor({ state: 'visible', timeout: 10000 });
		expect(await statusMsg.innerText()).toContain('Cotton Combed 30s');

		// Tambahkan Checkpoint di ActiveView
		await page.evaluate(() => {
			const host = document.getElementById('qa-knitto-fab-host');
			const sr = host?.shadowRoot;
			const inp = sr?.querySelector<HTMLInputElement>('input[placeholder*="checkpoint"], #input-catatan-\\/-checkpoint');
			if (inp) {
				const prototype = Object.getPrototypeOf(inp);
				const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
				prototypeValueSetter?.call(inp, 'Checkpoint Pembelian Berhasil Ditambahkan');
				inp.dispatchEvent(new Event('input', { bubbles: true }));
				inp.dispatchEvent(new Event('change', { bubbles: true }));
			}
			const btn = Array.from(sr?.querySelectorAll('button') || []).find((b) => b.textContent?.includes('Add Checkpoint'));
			btn?.click();
		});

		// Berikan jeda sejenak untuk Socket.IO / event sequence sync
		await page.waitForTimeout(1000);

		// Klik End Recording di ActiveView
		await page.evaluate(() => {
			const host = document.getElementById('qa-knitto-fab-host');
			const sr = host?.shadowRoot;
			const btn = Array.from(sr?.querySelectorAll('button') || []).find((b) => b.textContent?.includes('End Recording'));
			btn?.click();
		});

		// Di ResultView: Konfirmasi Selesai Recording
		const confirmEndBtn = page.locator('#qa-knitto-fab-host button:has-text("Konfirmasi End Session")').first();
		await confirmEndBtn.waitFor({ state: 'visible', timeout: 10000 });

		const clickResult = await page.evaluate(() => {
			const host = document.getElementById('qa-knitto-fab-host');
			const sr = host?.shadowRoot;
			const txt = sr?.querySelector<HTMLTextAreaElement>('textarea');
			if (txt) {
				const prototype = Object.getPrototypeOf(txt);
				const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
				prototypeValueSetter?.call(txt, 'Produk sukses ditambahkan dan status pesan tampil.');
				txt.dispatchEvent(new Event('input', { bubbles: true }));
				txt.dispatchEvent(new Event('change', { bubbles: true }));
			}
			const confirmBtn = Array.from(sr?.querySelectorAll('button') || []).find((b) => b.textContent?.includes('Konfirmasi End Session'));
			if (confirmBtn) {
				confirmBtn.click();
				return 'clicked';
			}
			return 'not_found';
		});
		console.log(`[E2E] End session confirm button: ${clickResult}`);

		// Tunggu sampai session selesai diproses di backend dan AI runner (polling status)
		let lastResult: string | null = null;
		for (let i = 0; i < 30; i++) {
			const checkSession = await pool.query<{ result: string | null; status: string }>(
				'SELECT result, status FROM recording_sessions ORDER BY id_session DESC LIMIT 1'
			);
			if (checkSession.rows.length > 0) {
				lastResult = checkSession.rows[0].result;
				if (checkSession.rows[0].result) {
					console.log(`[E2E] Session status: ${checkSession.rows[0].status}, result: ${checkSession.rows[0].result}`);
					break;
				}
			}
			await page.waitForTimeout(1000);
		}
		console.log(`[E2E] Polling finished, lastResult = ${lastResult}`);
	});

	it('4.1, 4.2, 4.3: PostgreSQL assertions, MinIO storage snapshot, dan AI output completed', async () => {
		// 4.1 Session dan Event Assertions di PostgreSQL
		const sessionRows = await pool.query<{
			id_session: string;
			status: string;
			result: string;
			test_case_no: string;
		}>(
			`SELECT id_session, status, result, test_case_no 
			 FROM recording_sessions 
			 ORDER BY id_session DESC LIMIT 1`
		);

		expect(sessionRows.rows.length).toBe(1);
		const session = sessionRows.rows[0];
		const sessionId = parseInt(session.id_session, 10);
		expect(session.result).toBe('PASS');

		// Verifikasi recording events
		const eventRows = await pool.query<{ id_event: string; event_type: string; sequence: string }>(
			`SELECT id_event, event_type, sequence 
			 FROM recording_events 
			 WHERE id_session = $1 
			 ORDER BY sequence ASC`,
			[sessionId]
		);
		expect(eventRows.rows.length).toBeGreaterThan(0);

		// Verifikasi checkpoint
		const cpRows = await pool.query<{ note: string }>(
			`SELECT note FROM recording_checkpoints WHERE id_session = $1`,
			[sessionId]
		);
		expect(cpRows.rows.length).toBeGreaterThan(0);
		expect(cpRows.rows[0].note).toContain('Checkpoint');

		// 4.2 Artifact & Storage Snapshot di PostgreSQL dan MinIO
		// Tunggu artifact storage_state tersimpan
		type ArtifactRow = { id_artifact: string; kind: string; object_key: string; content_type: string; size_bytes: string; status: string };
		let artifacts: ArtifactRow[] = [];
		const uploaded = (kind: string) => artifacts.find((r) => r.kind === kind && r.status === 'uploaded');
		for (let i = 0; i < 15; i++) {
			const artRows = await pool.query<ArtifactRow>(
				`SELECT id_artifact, kind, object_key, content_type, size_bytes, status
				 FROM recording_artifacts
				 WHERE id_session = $1`,
				[sessionId]
			);
			artifacts = artRows.rows;
			if (uploaded('storage_state') && uploaded('screenshot')) break;
			await new Promise((r) => setTimeout(r, 1000));
		}

		// Both artifact kinds are required (PRD success criterion 4), and each DB row must match a real MinIO object.
		const storageArtifact = uploaded('storage_state');
		const screenshotArtifact = uploaded('screenshot');
		expect(storageArtifact).toBeDefined();
		expect(screenshotArtifact).toBeDefined();
		for (const art of [storageArtifact!, screenshotArtifact!]) {
			const stat = await minioClient.statObject(endpoints.minio.bucket, art.object_key);
			expect(stat.size).toBeGreaterThan(0);
			expect(Number(art.size_bytes)).toBe(stat.size);
			expect(String(stat.metaData?.['content-type'] ?? art.content_type)).toBe(art.content_type);
		}
		expect(screenshotArtifact!.content_type).toMatch(/^image\//);

		{
			const stream = await minioClient.getObject(endpoints.minio.bucket, storageArtifact!.object_key);
			const chunks: Buffer[] = [];
			const artifactBuffer = await new Promise<Buffer>((resolve, reject) => {
				stream.on('data', (c) => chunks.push(c));
				stream.on('end', () => resolve(Buffer.concat(chunks)));
				stream.on('error', reject);
			});

			const artifactJson = JSON.parse(artifactBuffer.toString('utf-8'));
			// Pastikan fake credential fixtures tersimpan utuh di storage state
			const allJsonStr = JSON.stringify(artifactJson);
			expect(allJsonStr).toContain('fake_auth_token');
			expect(allJsonStr).toContain('fake_user_id');
		}

		// 4.3 AI Output Assertions di PostgreSQL
		// Generation must be triggered by the extension when the session ends (ISSUES 4.3) — there is
		// deliberately no API fallback here, so a broken UI trigger fails this test instead of hiding.
		let genRows: any[] = [];
		for (let i = 0; i < 20; i++) {
			const res = await pool.query<{
				kind: string;
				status: string;
				output: string;
			}>(
				`SELECT kind, status, output 
				 FROM recording_generations 
				 WHERE id_session = $1`,
				[sessionId]
			);
			genRows = res.rows;
			const done = (kind: string) => genRows.some((g) => g.kind === kind && g.status === 'completed');
			if (done('markdown') && done('playwright')) break;
			await new Promise((r) => setTimeout(r, 1000));
		}

		expect(genRows.length).toBeGreaterThan(0);
		const mdGen = genRows.find((g) => g.kind === 'markdown');
		expect(mdGen?.status).toBe('completed');
		expect(mdGen?.output).toContain('Ringkasan Pengujian');

		const pwGen = genRows.find((g) => g.kind === 'playwright');
		expect(pwGen?.status).toBe('completed');
		expect(pwGen?.output).toContain('@playwright/test');
	});
});
