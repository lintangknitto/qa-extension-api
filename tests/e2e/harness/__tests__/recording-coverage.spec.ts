import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { execSync, spawn } from 'child_process';
import type { Page, Worker } from '@playwright/test';
import { DisposableStack, type IDisposableStackEndpoints } from '../disposable-stack';
import { startFixtureServer, IFixtureServer } from '../fixture-server';
import { seedFixtureData, ISeedResult } from '../db-seed';
import { startBackendService, IBackendService } from '../backend-service';
import { launchBrowserHarness, IBrowserHarness } from '../browser-harness';

declare const chrome: any;

/**
 * E2E cakupan rekaman (docs/qa/recording-coverage-and-codegen-gaps/test-matrix.md PB-9):
 * rekam nyata fixture `/coverage` dengan extension → codegen → replay extension → `playwright test`.
 */

const projectRoot = path.resolve(__dirname, '../../../../');
/** Script hasil codegen dijalankan dari dalam repo agar `@playwright/test` ter-resolve. */
const playwrightWorkDir = path.join(projectRoot, 'tests/e2e/.tmp-recording-coverage');

describe('Cakupan rekaman & script Playwright (test-matrix PB-9)', () => {
	jest.setTimeout(900000);

	let stack: DisposableStack;
	let endpoints: IDisposableStackEndpoints;
	let fixture: IFixtureServer;
	let seeded: ISeedResult;
	let backend: IBackendService;
	let harness: IBrowserHarness;
	let pool: Pool;
	let token = '';
	let control: Page;
	let idSession = 0;
	let script = '';

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

	const sendToExtension = <T = any>(message: Record<string, unknown>): Promise<T> =>
		control.evaluate((msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve)), message) as Promise<T>;

	const tabIdOf = (urlPattern: string): Promise<number> =>
		control.evaluate(async (pattern) => {
			const tabs = await chrome.tabs.query({ url: pattern });
			return tabs[0]?.id as number;
		}, urlPattern);

	const openPage = async (url: string): Promise<Page> => {
		const page = await harness.context.newPage();
		await page.goto(url, { waitUntil: 'domcontentloaded' });
		return page;
	};

	const actionPayloads = async (): Promise<Array<{ type: string; payload: any; tab_id: number | null }>> => {
		const { rows } = await pool.query<{ event_type: string; payload: any; tab_id: number | null }>(
			"SELECT event_type, payload, tab_id FROM recording_events WHERE id_session = $1 AND event_type IN ('action', 'tab') ORDER BY sequence",
			[idSession]
		);
		return rows.map((row) => ({ type: row.event_type, payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload, tab_id: row.tab_id }));
	};

	const replay = (body: string) =>
		sendToExtension<any>({
			type: 'replay:run',
			options: {
				sessionId: idSession,
				testCaseNo: 'TC-COVERAGE-01',
				script: body,
				parameterOverrides: {},
				mode: 'tabGroup',
				stepDelayMs: 400,
				apiBaseUrl: backend.baseUrl
			}
		});

	/** Jalankan script codegen dengan Playwright sungguhan (headless, viewport sama dengan saat rekam). */
	// spawn asinkron: spawnSync memblokir event loop proses ini, padahal fixture server berjalan di sini.
	const runPlaywright = async (body: string, name: string): Promise<{ status: number | null; output: string }> => {
		fs.mkdirSync(playwrightWorkDir, { recursive: true });
		const specPath = path.join(playwrightWorkDir, `${name}.spec.ts`);
		fs.writeFileSync(specPath, body);
		fs.writeFileSync(
			path.join(playwrightWorkDir, 'playwright.config.ts'),
			"import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: '.', workers: 1, reporter: 'line', timeout: 60000, use: { headless: true, viewport: { width: 1280, height: 800 } } });\n"
		);
		const output: string[] = [];
		const status = await new Promise<number | null>((resolve) => {
			const child = spawn('pnpm', ['exec', 'playwright', 'test', `${name}.spec.ts`, '--config', 'playwright.config.ts'], {
				cwd: playwrightWorkDir,
				shell: true,
				// Variabel env Jest membuat Playwright Test menolak berjalan ("excluded from Jest test runs").
				env: Object.fromEntries(Object.entries({ ...process.env, CI: '1' }).filter(([key]) => !key.startsWith('JEST'))) as NodeJS.ProcessEnv
			});
			child.stdout.on('data', (chunk) => output.push(String(chunk)));
			child.stderr.on('data', (chunk) => output.push(String(chunk)));
			child.on('close', resolve);
		});
		return { status, output: output.join('') };
	};

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
		fs.rmSync(playwrightWorkDir, { recursive: true, force: true });
		await harness?.close().catch(() => undefined);
		await backend?.stop().catch(() => undefined);
		await fixture?.stop().catch(() => undefined);
		await pool?.end().catch(() => undefined);
		await stack?.stop().catch(() => undefined);
	});

	it('TC9-1: rekaman nyata fixture coverage menghasilkan event scroll/navigasi/keyboard/tab/canvas + checkpoint ber-target', async () => {
		const res = await api('POST', '/sessions', {
			id_project: seeded.project.id,
			id_test_case: seeded.testCase.id,
			test_case_no: 'TC-COVERAGE-01',
			title: 'Cakupan rekaman',
			target_url: `${fixture.baseUrl}/coverage`,
			force_end_previous: true
		});
		expect(res.status).toBe(201);
		idSession = Number(res.result.id_session);

		const page = await openPage(`${fixture.baseUrl}/coverage`);
		const tabId = await tabIdOf(`${fixture.baseUrl}/coverage*`);
		expect(await sendToExtension({ type: 'recordingStart', idSession, apiBaseUrl: backend.baseUrl, tabIds: [tabId], recordVideo: false })).toMatchObject({ success: true });
		await page.bringToFront();
		await page.waitForTimeout(1500);

		// Scroll window, container, dan dokumen iframe — masing-masing tidak langsung diikuti aksi di target yang sama.
		// Container & iframe dulu (masih di viewport), baru window.
		const list = (await page.locator('#chat-list').boundingBox())!;
		await page.mouse.move(list.x + list.width / 2, list.y + list.height / 2);
		await page.mouse.wheel(0, 300);
		await page.waitForTimeout(2500);
		const frame = (await page.locator('#frame-chat').boundingBox())!;
		await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
		await page.mouse.wheel(0, 200);
		await page.waitForTimeout(2500);
		// Jeda > SCROLL_FOLLOW_MS (2 dtk) ke aksi berikut agar scroll window termasuk scroll bermakna.
		await page.mouse.move(900, 20);
		await page.mouse.wheel(0, 600);
		await page.waitForTimeout(4000);

		// Shortcut & tombol navigasi.
		await page.fill('#pesan', 'Halo tim');
		await page.press('#pesan', 'Control+Enter');
		await page.locator('#status').filter({ hasText: 'Terkirim: Halo tim' }).waitFor();
		await page.focus('#opsi');
		await page.keyboard.press('ArrowDown');
		await page.locator('#status').filter({ hasText: 'Opsi: Rayon' }).waitFor();

		// Klik canvas, lalu checkpoint ber-target (payload sama dengan mode "Pilih elemen" FAB).
		await page.click('#kanvas', { position: { x: 50, y: 40 } });
		await page.locator('#status').filter({ hasText: 'Kanvas diklik' }).waitFor();
		await page.waitForTimeout(800);
		const context = await sendToExtension<{ sequence: number | null }>({ type: 'checkpoint:context' });
		expect(context.sequence).toBeGreaterThan(0);
		const checkpoint = await api('POST', `/sessions/${idSession}/checkpoints`, {
			note: 'Status kanvas tampil',
			sequence: context.sequence,
			target_locators: ["getByRole('status')"],
			target_text: 'Kanvas diklik',
			page_url: page.url(),
			tab_id: tabId
		});
		expect(checkpoint.status).toBe(201);

		// Navigasi: SPA ber-ID acak, back, reload, ketik URL.
		await page.click('#buka-chat');
		await page.waitForURL(/\/coverage\/chat\/\d{5}$/);
		await page.waitForTimeout(2000);
		await page.goBack();
		await page.waitForURL(/\/coverage$/);
		await page.waitForTimeout(2000);
		await page.reload();
		await page.waitForTimeout(2000);
		await page.goto(`${fixture.baseUrl}/coverage?tab=2`);
		await page.waitForTimeout(2000);

		// Tab kedua dari klik, aksi di tab itu, lalu kembali ke tab awal.
		const [invoice] = await Promise.all([harness.context.waitForEvent('page'), page.click('#buka-invoice')]);
		await invoice.waitForLoadState('domcontentloaded');
		await invoice.bringToFront();
		await invoice.waitForTimeout(2000);
		await invoice.click('#cetak');
		await invoice.locator('#cetak-status').filter({ hasText: 'Dicetak' }).waitFor();
		await invoice.waitForTimeout(1000);
		await page.bringToFront();
		await page.waitForTimeout(2000);
		await page.click('#selesai');
		await page.waitForTimeout(1500);

		expect(await sendToExtension({ type: 'recordingStop' })).toMatchObject({ success: true });
		expect((await api('POST', `/sessions/${idSession}/end`, { result: 'PASS', actual_result: 'Semua langkah berjalan' })).status).toBe(200);
		await invoice.close();
		await page.close();

		const events = await actionPayloads();
		const actions = events.filter((e) => e.type === 'action').map((e) => e.payload);
		console.log('[E2E] event aksi:', actions.map((a) => `${a.action}${a.navigation_type ? `:${a.navigation_type}` : ''}${a.key ? `:${[...(a.modifiers ?? []), a.key].join('+')}` : ''}`).join(', '));

		const scrolls = actions.filter((a) => a.action === 'scroll');
		expect(scrolls.find((s) => !s.unique_locator && !s.frame_locators)).toMatchObject({ scroll_y: 600 });
		expect(scrolls.find((s) => s.unique_locator === "getByTestId('chat-list')")).toMatchObject({ scroll_y: 300 });
		expect(scrolls.find((s) => Array.isArray(s.frame_locators) && s.frame_locators.length === 1)).toMatchObject({ scroll_y: 200 });

		const navigationTypes = actions.filter((a) => a.action === 'navigation').map((a) => a.navigation_type);
		expect(navigationTypes).toEqual(expect.arrayContaining(['same_document', 'back_forward', 'reload']));
		// page.goto (CDP Page.navigate) bukan ketikan address bar: Chrome memberi transition typed atau lainnya; keduanya → goto URL persis.
		expect(['typed', 'other']).toContain(navigationTypes[navigationTypes.length - 1]);
		expect(actions.filter((a) => a.action === 'keydown').map((a) => [...(a.modifiers ?? []), a.key].join('+'))).toEqual(
			expect.arrayContaining(['Control+Enter', 'ArrowDown'])
		);
		expect(actions.find((a) => a.action === 'click' && a.element?.tagName === 'CANVAS')).toMatchObject({ client_x: expect.any(Number), viewport_w: 1280 });
		const opened = events.find((e) => e.type === 'tab' && e.payload.kind === 'opened');
		expect(opened?.payload).toMatchObject({ opener_tab_id: tabId, url: expect.stringMatching(/\/coverage\/invoice\/9001$/) });

		const { rows: [saved] } = await pool.query('SELECT target_locators, target_text, page_url, tab_id FROM recording_checkpoints WHERE id_session = $1', [idSession]);
		expect(saved).toEqual({ target_locators: ["getByRole('status')"], target_text: 'Kanvas diklik', page_url: `${fixture.baseUrl}/coverage`, tab_id: tabId });
	});

	it('TC9-2: script codegen memuat semua langkah sesuai aturan PRD + ringkasan header', async () => {
		expect((await api('POST', `/sessions/${idSession}/generations`, { kinds: ['playwright'] })).status).toBeLessThan(300);
		const generations = await api('GET', `/sessions/${idSession}/generations`);
		script = (generations.result.items ?? generations.result).find((g: any) => g.kind === 'playwright').output;
		console.log('[E2E] script codegen:\n' + script);

		const expectations: Array<string | RegExp> = [
			"async ({ page, context }) => {",
			/\/\/ Ringkasan: \d+ event aksi → \d+ langkah\./,
			`await page.goto('${fixture.baseUrl}/coverage');`,
			'await page.mouse.wheel(0, 600);',
			"await page.getByTestId('chat-list').evaluate((el) => el.scrollTo(0, 300));",
			/await page\.getByTitle\('Live Chat'.*\)\.contentFrame\(\)\.locator\('html'\)\.evaluate\(\(el\) => el\.scrollTo\(0, 200\)\);/,
			/\.press\('Control\+Enter'\);/,
			/\.press\('ArrowDown'\);/,
			/await page\..*\.click\(\);[^\n]*\n(?:\t\/\/[^\n]*\n)*\tawait expect\(page\.getByRole\('status'\)\)\.toContainText\('Kanvas diklik'\);/,
			"await page.waitForURL('**/coverage/chat/*');",
			'await page.goBack();',
			'await page.reload();',
			`await page.goto('${fixture.baseUrl}/coverage?tab=2');`,
			/const \[page2\] = await Promise\.all\(\[page\.waitForEvent\('popup'\), page\..*\.click\(\)\]\);/,
			/await page2\..*Cetak.*\.click\(\);/,
			'await page.bringToFront();',
			/await page\..*Selesai.*\.click\(\);/
		];
		for (const expected of expectations) {
			if (typeof expected === 'string') expect(script).toContain(expected);
			else expect(script).toMatch(expected);
		}
		expect(script).not.toMatch(/\/coverage\/chat\/\d{5}/);
	});

	it('TC9-3: script di-replay extension (run PASS) dan lewat Playwright sungguhan', async () => {
		const res = await replay(script);
		console.log('[E2E] replay extension:', JSON.stringify({ ...res.result, failedStep: res.result?.failedStep?.description }));
		expect(res.result).toMatchObject({ success: true });
		expect(res.run).toMatchObject({ result: 'PASS' });
		for (const page of harness.context.pages()) if (page !== control) await page.close();

		const pw = await runPlaywright(script, 'coverage-pass');
		console.log('[E2E] playwright test (pass):\n' + pw.output.slice(-1500));
		expect(pw.status).toBe(0);
		expect(pw.output).toMatch(/1 passed/);
	});

	it('TC9-4: assertion checkpoint yang sengaja salah menggagalkan run dengan pesan jelas', async () => {
		const wrong = script.replace("toContainText('Kanvas diklik')", "toContainText('Teks yang salah')");
		expect(wrong).not.toBe(script);

		const res = await replay(wrong);
		expect(res.result.success).toBe(false);
		expect(res.result.error).toContain('Assertion gagal');
		expect(res.result.error).toContain('"Teks yang salah"');
		expect(res.result.error).toContain('Kanvas diklik');
		for (const page of harness.context.pages()) if (page !== control) await page.close();

		let failure: any = null;
		for (let i = 0; i < 20 && !failure; i++) {
			const { rows } = await pool.query("SELECT payload FROM recording_events WHERE id_session = $1 AND event_type = 'replay_failure' ORDER BY sequence DESC LIMIT 1", [idSession]);
			failure = rows[0]?.payload ?? null;
			if (!failure) await new Promise((resolve) => setTimeout(resolve, 500));
		}
		expect(JSON.stringify(failure)).toContain('Teks yang salah');

		const pw = await runPlaywright(wrong, 'coverage-fail');
		expect(pw.status).not.toBe(0);
		expect(pw.output).toMatch(/1 failed/);
		expect(pw.output).toContain('Teks yang salah');
	});

	it('TC9-5: halaman share & konteks AI menampilkan scroll, jenis navigasi, shortcut, checkpoint ber-target', async () => {
		const share = await api('POST', `/sessions/${idSession}/share`);
		expect(share.status).toBe(200);
		const page = await openPage(`${backend.baseUrl}/share/${share.result.share_token}`);
		const timeline = await page.locator('ol[aria-label="Timeline langkah"]').innerText();
		await page.close();
		expect(timeline).toContain('Scroll halaman ke (0, 600)');
		expect(timeline).toContain("Scroll container getByTestId('chat-list')");
		expect(timeline).toContain('Navigasi (SPA)');
		expect(timeline).toContain('Navigasi (kembali)');
		expect(timeline).toContain('Navigasi (muat ulang)');
		expect(timeline).toMatch(/Navigasi \((ketik URL|lainnya)\) ke [^\n]*\/coverage\?tab=2/);
		expect(timeline).toContain('Tombol Control+Enter');
		expect(timeline).toContain(`🎯 elemen getByRole('status') berisi "Kanvas diklik"`);

		const aiContext = await fetch(`${backend.baseUrl}/api/v1/sessions/share/${share.result.share_token}/ai-context`).then((r) => r.json());
		const labels: string[] = aiContext.result.step_events.map((s: any) => s.label);
		expect(labels).toEqual(expect.arrayContaining([expect.stringContaining('Navigasi (SPA)'), expect.stringContaining('Tombol ArrowDown'), expect.stringContaining('Tab baru dibuka dari aksi')]));
		expect(aiContext.result.checkpoints[0]).toMatchObject({ target_locators: ["getByRole('status')"], target_text: 'Kanvas diklik' });
	});
});
