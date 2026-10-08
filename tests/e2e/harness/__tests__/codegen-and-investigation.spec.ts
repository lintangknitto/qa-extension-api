import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Pool } from 'pg';
import { execSync, spawn } from 'child_process';
import type { Page } from '@playwright/test';
import { DisposableStack } from '../disposable-stack';
import { startFixtureServer, IFixtureServer } from '../fixture-server';
import { seedFixtureData, ISeedResult } from '../db-seed';
import { startBackendService, IBackendService } from '../backend-service';
import { launchBrowserHarness, IBrowserHarness } from '../browser-harness';
import { startMockGrafana, IMockGrafana } from '../mock-grafana';

declare const chrome: any;

const projectRoot = path.resolve(__dirname, '../../../../');
const FAB = '#qa-knitto-fab-host';

type GenerationRow = { kind: string; status: string; output: string | null; model: string | null };

/** Isi input React di shadow root FAB (setter prototype + event input/change). */
const setShadowValue = (page: Page, selector: string, value: string) =>
	page.evaluate(
		({ selector, value }) => {
			const el = document.getElementById('qa-knitto-fab-host')?.shadowRoot?.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
			if (!el) throw new Error(`Elemen FAB tidak ditemukan: ${selector}`);
			Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value);
			el.dispatchEvent(new Event('input', { bubbles: true }));
			el.dispatchEvent(new Event('change', { bubbles: true }));
		},
		{ selector, value }
	);

const clickShadowButton = (page: Page, text: string) =>
	page.evaluate((text) => {
		const btn = Array.from(document.getElementById('qa-knitto-fab-host')?.shadowRoot?.querySelectorAll('button') || []).find((b) =>
			b.textContent?.includes(text)
		);
		if (!btn) throw new Error(`Tombol FAB tidak ditemukan: ${text}`);
		btn.click();
	}, text);

describe('Codegen deterministik, replay, dan investigasi 5xx (ISSUES 8.2 & 8.3)', () => {
	jest.setTimeout(240000);

	let stack: DisposableStack;
	let fixture: IFixtureServer;
	let grafana: IMockGrafana;
	let seeded: ISeedResult;
	let backend: IBackendService;
	let harness: IBrowserHarness;
	let pool: Pool;
	let generatedDir: string | null = null;
	let passSessionId = 0;
	let passScript = '';

	const latestSessionId = async () =>
		Number((await pool.query<{ id_session: string }>('SELECT id_session FROM recording_sessions ORDER BY id_session DESC LIMIT 1')).rows[0]?.id_session ?? 0);

	const waitForGeneration = async (idSession: number, kind: string, timeoutMs = 60000): Promise<GenerationRow | undefined> => {
		const deadline = Date.now() + timeoutMs;
		let row: GenerationRow | undefined;
		while (Date.now() < deadline) {
			row = (
				await pool.query<GenerationRow>(
					'SELECT kind, status, output, model FROM recording_generations WHERE id_session = $1 AND kind = $2 ORDER BY 1 DESC',
					[idSession, kind]
				)
			).rows[0];
			if (row && row.status !== 'processing' && row.status !== 'pending') return row;
			await new Promise((r) => setTimeout(r, 1000));
		}
		return row;
	};

	/** Login (bila perlu) lalu mulai recording di halaman aktif. */
	const startRecording = async (page: Page) => {
		await page.locator(FAB).waitFor({ state: 'attached', timeout: 15000 });
		const startBtn = page.locator(`${FAB} button:has-text("Start Recording")`).first();
		if (!(await startBtn.isVisible().catch(() => false))) {
			const trigger = page.locator(`${FAB} button[aria-label="Knitto QA Tools"]`).first();
			await (await trigger.isVisible({ timeout: 3000 }).catch(() => false) ? trigger : page.locator(`${FAB} button`).first()).click();
		}
		const username = page.locator(`${FAB} input[placeholder*="username"]`).first();
		if (await username.isVisible({ timeout: 3000 }).catch(() => false)) {
			await username.fill(seeded.user.username);
			await page.locator(`${FAB} input[placeholder*="password"]`).first().fill(seeded.user.passwordPlain);
			await page.locator(`${FAB} button:has-text("Login")`).first().click();
		}
		await startBtn.waitFor({ state: 'visible', timeout: 20000 });
		// Pilih project seed (select tersembunyi milik Combobox) agar sesi terhubung ke program + dashboard Grafana.
		await page.waitForFunction(
			(id) => Array.from(document.getElementById('qa-knitto-fab-host')?.shadowRoot?.querySelectorAll('select option') || []).some((o) => (o as HTMLOptionElement).value === id),
			String(seeded.project.id),
			{ timeout: 15000 }
		);
		await page.evaluate((id) => {
			const sr = document.getElementById('qa-knitto-fab-host')?.shadowRoot;
			const select = Array.from(sr?.querySelectorAll('select') || []).find((s) => Array.from(s.options).some((o) => o.value === id));
			Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, id);
			select?.dispatchEvent(new Event('change', { bubbles: true }));
		}, String(seeded.project.id));
		await page.waitForTimeout(500);
		await setShadowValue(page, '#input-nomor-test-case', seeded.testCase.testCaseNo);
		await setShadowValue(page, '#input-judul', seeded.testCase.title);
		await page.evaluate(() => {
			const sr = document.getElementById('qa-knitto-fab-host')?.shadowRoot;
			const chk = sr?.querySelector<HTMLInputElement>('input[type="checkbox"]');
			if (chk?.checked) chk.click();
			sr?.querySelector('form')?.requestSubmit();
		});
		await page.locator(`${FAB} span:has-text("Recording Aktif")`).first().waitFor({ state: 'visible', timeout: 15000 });
	};

	const endRecording = async (page: Page, result: 'PASS' | 'FAIL', actual: string) => {
		await page.waitForTimeout(1000); // beri waktu event terakhir tersinkron via Socket.IO
		await clickShadowButton(page, 'End Recording');
		await page.locator(`${FAB} button:has-text("Konfirmasi End Session")`).first().waitFor({ state: 'visible', timeout: 10000 });
		if (result === 'FAIL') {
			await page.evaluate(() => {
				const sr = document.getElementById('qa-knitto-fab-host')?.shadowRoot;
				const btn = Array.from(sr?.querySelectorAll('button[aria-pressed]') || []).find((b) => b.textContent?.includes('FAIL'));
				if (btn) (btn as HTMLButtonElement).click();
				const select = Array.from(sr?.querySelectorAll('select') || []).find((s) => Array.from(s.options).some((o) => o.value === 'FAIL'));
				if (select) {
					Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'FAIL');
					select.dispatchEvent(new Event('change', { bubbles: true }));
				}
			});
		}
		await setShadowValue(page, 'textarea', actual);
		await clickShadowButton(page, 'Konfirmasi End Session');
		for (let i = 0; i < 30; i++) {
			const row = (await pool.query<{ result: string | null }>('SELECT result FROM recording_sessions ORDER BY id_session DESC LIMIT 1')).rows[0];
			if (row?.result) return row.result;
			await page.waitForTimeout(1000);
		}
		return null;
	};

	beforeAll(async () => {
		stack = new DisposableStack();
		const endpoints = await stack.start();
		execSync(`pnpm exec tsx "${path.join(projectRoot, 'scripts/migrate.ts')}"`, {
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

		fixture = await startFixtureServer();
		grafana = await startMockGrafana();
		pool = new Pool({
			host: endpoints.postgres.host,
			port: endpoints.postgres.port,
			user: endpoints.postgres.user,
			password: endpoints.postgres.pass,
			database: endpoints.postgres.db
		});
		seeded = await seedFixtureData(pool, { baseUrl: fixture.baseUrl });
		const dashboardUrl =
			`${grafana.baseUrl}/d/${grafana.dashboardUid}/monitoring-logs-docker` +
			'?var-provider=GCP&var-environment=STAGING&var-cabang=GCP-DATABASE&var-service=knitto-api-chat-staging';
		await pool.query('UPDATE programs SET grafana_dashboard_url = $1 WHERE id_program = $2', [dashboardUrl, seeded.program.id]);

		// Backend mewarisi process.env: arahkan Grafana ke server mock (bukan Grafana kantor).
		process.env.GRAFANA_URL = grafana.baseUrl;
		process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN = 'e2e-fake-grafana-token';
		backend = await startBackendService(endpoints);
		harness = await launchBrowserHarness({ apiBaseUrl: backend.baseUrl, headless: true });
	});

	afterAll(async () => {
		await harness?.close().catch(() => undefined);
		await backend?.stop().catch(() => undefined);
		await fixture?.stop().catch(() => undefined);
		await grafana?.stop().catch(() => undefined);
		await pool?.end().catch(() => undefined);
		await stack?.stop().catch(() => undefined);
		if (generatedDir) fs.rmSync(generatedDir, { recursive: true, force: true });
	});

	it('8.2a: rekaman nyata menghasilkan script Playwright deterministik 1:1 dengan aksi tester', async () => {
		const { page } = harness;
		await page.goto(`${fixture.baseUrl}/checkout`, { waitUntil: 'domcontentloaded' });
		await startRecording(page);

		await page.locator('#customer').fill('Budi Santoso', { force: true });
		await page.locator('#fabric').selectOption({ label: 'Rayon Viscose' }, { force: true });
		await page.locator('#express').check({ force: true });
		await page.locator('#quote').click({ force: true });
		expect(await page.locator('#result').innerText()).toBe('Ongkir Rayon Viscose untuk Budi Santoso (ekspres)');

		expect(await endRecording(page, 'PASS', 'Ongkir tampil sesuai input.')).toBe('PASS');
		passSessionId = await latestSessionId();

		const pw = await waitForGeneration(passSessionId, 'playwright');
		expect(pw?.status).toBe('completed');
		expect(pw?.model).toBe('deterministic-codegen');
		passScript = pw!.output!;
		console.log('[E2E] Script hasil codegen:\n' + passScript);

		// Urutan & jumlah aksi 1:1 (goto awal + 4 aksi tester), tanpa aksi internal FAB.
		const actionLines = passScript.split('\n').filter((l) => /^\s*await page\./.test(l));
		expect(actionLines).toHaveLength(5);
		expect(actionLines[0]).toContain(`page.goto('${fixture.baseUrl}/checkout')`);
		expect(actionLines[1]).toMatch(/\.fill\('Budi Santoso'\)/);
		expect(actionLines[2]).toMatch(/\.selectOption\(\{ label: 'Rayon Viscose' \}\)/);
		expect(actionLines[3]).toMatch(/\.check\(\)/);
		expect(actionLines[4]).toMatch(/\.click\(\)/);
		expect(passScript).not.toMatch(/qa-knitto/);

		// Deterministik: generate ulang menghasilkan output byte-identik.
		const loginRes = await fetch(`${backend.baseUrl}/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username: seeded.user.username, password: seeded.user.passwordPlain })
		});
		const loginJson = JSON.stringify(await loginRes.json());
		const token = loginJson.match(/"(?:access_)?token"\s*:\s*"([^"]+)"/)?.[1];
		expect(token).toBeTruthy();
		const regen = await fetch(`${backend.baseUrl}/sessions/${passSessionId}/generations`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
			body: JSON.stringify({ kinds: ['playwright'] })
		});
		expect(regen.status).toBeLessThan(300);
		// Row generation per kind ditimpa saat generate ulang: output baru harus sama persis dengan yang pertama.
		expect(JSON.stringify(await regen.json())).toContain(JSON.stringify(passScript).slice(1, -1));
		const latest = await waitForGeneration(passSessionId, 'playwright');
		expect(latest?.output).toBe(passScript);
	});

	it('8.2b: script hasil generate lolos `npx playwright test`', async () => {
		expect(passScript).toBeTruthy();
		// Di dalam repo supaya `@playwright/test` ter-resolve dari node_modules.
		generatedDir = path.join(projectRoot, 'test-results', `codegen-e2e-${crypto.randomBytes(4).toString('hex')}`);
		fs.mkdirSync(generatedDir, { recursive: true });
		fs.writeFileSync(path.join(generatedDir, 'recorded.spec.ts'), passScript);
		fs.writeFileSync(
			path.join(generatedDir, 'playwright.config.ts'),
			"import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: '.', reporter: 'line', timeout: 30000, use: { headless: true } });\n"
		);
		const bin = path.join(projectRoot, 'node_modules/.bin', process.platform === 'win32' ? 'playwright.cmd' : 'playwright');
		// Async (bukan spawnSync): fixture server hidup di proses ini dan harus tetap bisa merespons.
		const run = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
			const child = spawn(`"${bin}"`, ['test', '--config', `"${path.join(generatedDir!, 'playwright.config.ts')}"`], {
				cwd: generatedDir!,
				// Tanpa env JEST_*: Playwright Test menolak jalan bila mendeteksi worker Jest.
				env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('JEST'))),
				shell: true
			});
			let stdout = '';
			let stderr = '';
			child.stdout.on('data', (d) => (stdout += d));
			child.stderr.on('data', (d) => (stderr += d));
			child.on('close', (status) => resolve({ status, stdout, stderr }));
		});
		console.log('[E2E] npx playwright test:\n' + run.stdout + run.stderr);
		expect(run.status).toBe(0);
		expect(run.stdout).toMatch(/1 passed/);
	});

	it('8.2c: script yang sama lolos di Replay Engine extension', async () => {
		const worker = harness.context.serviceWorkers()[0];
		const extensionId = new URL(worker.url()).host;
		const statusPage = await harness.context.newPage();
		await statusPage.goto(`chrome-extension://${extensionId}/status.html`);
		const response = await statusPage.evaluate(
			(options) => new Promise<any>((resolve) => chrome.runtime.sendMessage({ type: 'replay:run', options }, resolve)),
			{ sessionId: passSessionId, testCaseNo: seeded.testCase.testCaseNo, script: passScript, parameterOverrides: {}, mode: 'tabGroup', speedMode: 'fast' }
		);
		console.log('[E2E] Replay result:', JSON.stringify(response?.result));
		expect(response?.result?.success).toBe(true);
		expect(response.result.executedSteps).toBe(response.result.totalSteps);
		expect(response.result.totalSteps).toBeGreaterThanOrEqual(5);
		await statusPage.close();
	});

	it('8.3: sesi FAIL dengan request 5xx menghasilkan investigasi yang mengutip baris Loki + link dashboard', async () => {
		const page = await harness.context.newPage();
		await page.goto(`${fixture.baseUrl}/checkout`, { waitUntil: 'domcontentloaded' });
		await startRecording(page);

		await page.locator('#customer').fill('Siti Aminah', { force: true });
		await page.locator('#order').click({ force: true });
		await page.locator('#result').filter({ hasText: 'Gagal membuat pesanan (500)' }).waitFor({ timeout: 10000 });
		const requestId = fixture.lastOrderRequestId();
		expect(requestId).toBeTruthy();

		// Baris log backend yang memuat requestId (seperti log knitto-api-chat-staging di Loki).
		const now = Date.now();
		const errorLine = `level=error requestId=${requestId} msg="POST /api/order gagal: duplicate key value violates unique constraint orders_pkey"`;
		grafana.addLokiLines([
			{ timestampMs: now - 1000, line: `level=info requestId=${requestId} msg="POST /api/order diterima"` },
			{ timestampMs: now, line: errorLine },
			{ timestampMs: now - 500, line: 'level=info msg="healthcheck ok"' }
		]);

		expect(await endRecording(page, 'FAIL', 'Pesanan gagal dibuat, muncul error 500.')).toBe('FAIL');
		const failSessionId = await latestSessionId();

		// Event network 5xx tersimpan dengan request_id dari header respons.
		const net = await pool.query<{ payload: any }>(
			"SELECT payload FROM recording_events WHERE id_session = $1 AND event_type = 'network'",
			[failSessionId]
		);
		const failed = net.rows.map((r) => (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload)).find((p) => p.request_id === requestId);
		expect(failed).toBeDefined();

		// Investigasi dipicu otomatis saat sesi selesai dengan FAIL.
		const inv = await waitForGeneration(failSessionId, 'investigation', 90000);
		console.log('[E2E] Laporan investigasi:\n' + inv?.output);
		expect(inv?.status).toBe('completed');
		expect(inv!.output).toContain(errorLine);
		// Hanya baris ber-requestId yang dihitung cocok; baris lain boleh muncul sebagai konteks ±2 detik (ISSUES 5.2).
		expect(inv!.output).toContain(`(requestId ${requestId}) — 2 baris log`);
		expect(inv!.output).toContain('## Bukti & tautan dashboard');
		expect(inv!.output).toContain(`${grafana.baseUrl}/d/${grafana.dashboardUid}`);
		expect(inv!.output).toMatch(new RegExp(`\\[buka dashboard\\]\\([^)]*${requestId}`));
		expect(grafana.lokiQueries.some((q) => q.includes(`|= "${requestId}"`) && q.includes('knitto-api-chat-staging'))).toBe(true);
		await page.close();
	});
});
