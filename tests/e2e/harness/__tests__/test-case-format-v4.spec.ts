import path from 'path';
import fs from 'fs';
import os from 'os';
import { Pool } from 'pg';
import { execSync } from 'child_process';
import ExcelJS from 'exceljs';
import type { Locator, Page } from '@playwright/test';
import { DisposableStack } from '../disposable-stack';
import { startFixtureServer, IFixtureServer } from '../fixture-server';
import { seedFixtureData, ISeedResult } from '../db-seed';
import { startBackendService, IBackendService } from '../backend-service';
import { launchBrowserHarness, IBrowserHarness } from '../browser-harness';
import { hashPassword } from '../../../../src/libs/helpers/password';

/**
 * E2E format test case V4 & registry template (docs/qa/test-case-format-v4-and-template-registry/test-matrix.md).
 * Memakai spreadsheet Google "FORMAT TEST CASE" asli (diunduh live) untuk import & ekspor.
 */

const projectRoot = path.resolve(__dirname, '../../../../');
const FAB = '#qa-knitto-fab-host';
const SHEET = 'https://docs.google.com/spreadsheets/d/1k_08EdNZUBGBhLNU-FIPxqm06PpCfn4Dyprc4sDYCsI/edit';
const CONTOH_URL = `${SHEET}?gid=603972469#gid=603972469`;

describe('Format test case V4 & registry template (test-matrix PB-1..PB-4)', () => {
	jest.setTimeout(300000);

	let stack: DisposableStack;
	let fixture: IFixtureServer;
	let seeded: ISeedResult;
	let backend: IBackendService;
	let harness: IBrowserHarness;
	let pool: Pool;
	let adminToken = '';
	let qaToken = '';
	let otherQa = { username: '', password: '' };
	let emptyProjectId = 0;
	let v4Id = 0;
	let v5Id = 0;
	const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knitto-v4-export-'));

	const api = async (method: string, url: string, token: string, body?: unknown) => {
		const res = await fetch(`${backend.baseUrl}${url}`, {
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

	const login = async (username: string, password: string) => {
		const res = await fetch(`${backend.baseUrl}/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username, password })
		});
		const token = JSON.stringify(await res.json()).match(/"(?:access_)?token"\s*:\s*"([^"]+)"/)?.[1];
		if (!token) throw new Error(`Login gagal untuk ${username}`);
		return token;
	};

	const fab = (page: Page): Locator => page.locator(FAB);

	/** Buka FAB dan login lewat LoginView bila belum login. */
	const openFabAs = async (page: Page, username: string, password: string) => {
		await page.goto(`${fixture.baseUrl}/checkout`, { waitUntil: 'domcontentloaded' });
		await fab(page).waitFor({ state: 'attached', timeout: 15000 });
		const userInput = page.locator(`${FAB} input[placeholder="Masukkan username"]`);
		if (!(await userInput.isVisible().catch(() => false))) {
			const trigger = page.locator(`${FAB} button[aria-label="Knitto QA Tools"]`).first();
			if (await trigger.isVisible({ timeout: 3000 }).catch(() => false)) await trigger.dispatchEvent('click');
		}
		if (await userInput.isVisible({ timeout: 5000 }).catch(() => false)) {
			await userInput.fill(username);
			await page.locator(`${FAB} input[placeholder="Masukkan password"]`).fill(password);
			await page.locator(`${FAB} input[placeholder="Masukkan password"]`).press('Enter');
		}
		await page.locator(`${FAB} button[aria-label="Project"]`).waitFor({ state: 'visible', timeout: 20000 });
	};

	const logout = async (page: Page) => {
		await page.locator(`${FAB} button[aria-label="Logout"]`).dispatchEvent('click');
		await page.locator(`${FAB} input[placeholder="Masukkan username"]`).waitFor({ state: 'visible', timeout: 15000 });
	};

	const openProject = async (page: Page, name: string) => {
		await page.locator(`${FAB} button[aria-label="Project"]`).dispatchEvent('click');
		// Dari halaman detail project, kembali ke katalog dulu.
		const back = page.locator(`${FAB} button:has-text("Semua Project")`).first();
		if (await back.isVisible({ timeout: 1500 }).catch(() => false)) await back.dispatchEvent('click');
		await page.locator(`${FAB} >> text=${name}`).first().dispatchEvent('click');
	};

	const readWorkbook = async (file: string) => {
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.readFile(file);
		return wb;
	};

	const formula = (ws: ExcelJS.Worksheet, addr: string) => (ws.getCell(addr).value as { formula?: string } | null)?.formula;

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
		pool = new Pool({
			host: endpoints.postgres.host,
			port: endpoints.postgres.port,
			user: endpoints.postgres.user,
			password: endpoints.postgres.pass,
			database: endpoints.postgres.db
		});
		seeded = await seedFixtureData(pool, { baseUrl: fixture.baseUrl });
		// Pengelola template = ADMIN.
		await pool.query("UPDATE users SET level = 'ADMIN' WHERE id_user = $1", [seeded.user.id]);

		// User QA kedua, di-assign hanya ke project lain (untuk cek akses ekspor).
		otherQa = { username: `qa_other_${Date.now()}`, password: 'OtherQaPass!_2026_99' };
		const other = await pool.query<{ id_user: string }>(
			"INSERT INTO users (username, password, nama, level, is_active) VALUES ($1, $2, 'QA Lain', 'QA', TRUE) RETURNING id_user",
			[otherQa.username, await hashPassword(otherQa.password)]
		);
		const empty = await pool.query<{ id_project: string }>(
			"INSERT INTO projects (name, code, is_active, created_by_user_id) VALUES ('Project V4 Kosong', 'project-v4-kosong', TRUE, $1) RETURNING id_project",
			[seeded.user.id]
		);
		emptyProjectId = Number(empty.rows[0].id_project);
		await pool.query('INSERT INTO user_projects (id_user, id_project) VALUES ($1, $2)', [other.rows[0].id_user, emptyProjectId]);

		backend = await startBackendService(endpoints);
		adminToken = await login(seeded.user.username, seeded.user.passwordPlain);
		qaToken = await login(otherQa.username, otherQa.password);
		harness = await launchBrowserHarness({ apiBaseUrl: backend.baseUrl, headless: true });
	});

	afterAll(async () => {
		await harness?.close().catch(() => undefined);
		await backend?.stop().catch(() => undefined);
		await fixture?.stop().catch(() => undefined);
		await pool?.end().catch(() => undefined);
		await stack?.stop().catch(() => undefined);
		fs.rmSync(downloadDir, { recursive: true, force: true });
	});

	// ---------------------------------------------------------------- PB-1 registry (API)
	it('TC1-1: template default V4 dari seed tersedia untuk user QA', async () => {
		const res = await api('GET', '/test-case-templates/default', qaToken);
		expect(res.status).toBe(200);
		expect(res.result).toMatchObject({ version_label: 'V4', gid: '1730053292', is_default: true, is_active: true });
		expect(Object.keys(res.result.column_mapping)).toHaveLength(17);
		v4Id = res.result.id_template;
	});

	it('TC1-2: QA tidak bisa mendaftarkan template (403)', async () => {
		const res = await api('POST', '/test-case-templates', qaToken, {
			version_label: 'X1',
			name: 'Template QA',
			spreadsheet_url: SHEET,
			column_mapping: { test_case_id: { header: 'Test Case ID' }, title: { header: 'Test Case' } }
		});
		expect(res.status).toBe(403);
		expect(Number((await pool.query('SELECT COUNT(*) AS n FROM test_case_templates')).rows[0].n)).toBe(1);
	});

	it('TC1-3: template default tidak bisa dinonaktifkan (400)', async () => {
		const res = await api('PATCH', `/test-case-templates/${v4Id}/deactivate`, adminToken);
		expect(res.status).toBe(400);
		expect(JSON.stringify(res.json)).toContain('Template default tidak bisa dinonaktifkan');
	});

	// ---------------------------------------------------------------- PB-1 registry (UI)
	it('TC2-1 & TC2-2: admin melihat V4 Default lalu mendaftarkan template "V5" (tab CONTOH) lewat Pengaturan + Uji template', async () => {
		const { page } = harness;
		await openFabAs(page, seeded.user.username, seeded.user.passwordPlain);
		await page.locator(`${FAB} button[aria-label="Setting"]`).dispatchEvent('click');

		const list = page.locator(`${FAB} [aria-label="Daftar template test case"]`);
		await list.waitFor({ state: 'visible', timeout: 15000 });
		const v4Row = list.locator('[role="listitem"]', { hasText: 'V4' });
		await expect(v4Row.locator('text=Default').isVisible()).resolves.toBe(true);

		await page.locator(`${FAB} button:has-text("Tambah")`).first().dispatchEvent('click');
		const dialog = page.locator(`${FAB} .k-modal-overlay[role="dialog"]`);
		await dialog.waitFor({ state: 'visible' });
		await dialog.getByLabel('Versi', { exact: true }).fill('V5');
		await dialog.getByLabel('Nama', { exact: true }).fill('CONTOH TEST CASE (tiruan V5)');
		await dialog.getByLabel('URL Google Spreadsheet').fill(SHEET);
		await dialog.getByLabel('GID tab').fill('603972469');
		// Tab CONTOH tidak punya TYPE & Automation Tools; FC-nya "Process No (FC)" (blok kedua: "Prosess").
		await dialog.locator('input[aria-label="Header TYPE"]').fill('');
		await dialog.locator('input[aria-label="Header Automation Tools"]').fill('');
		await dialog.locator('input[aria-label="Alias Process No (FC)"]').fill('Prosess No (FC)');
		await dialog.getByLabel('Anchor ekspor (JSON)').fill(JSON.stringify({ sheet_name: 'CONTOH TEST CASE', header_row: 8, data_start_row: 9 }));

		await dialog.locator('button:has-text("Uji template")').dispatchEvent('click');
		const status = dialog.locator('[role="status"]');
		await status.waitFor({ state: 'visible', timeout: 30000 });
		expect(await status.innerText()).toContain('Header di baris 8');
		await expect(dialog.locator('[data-testid="check-test_case_id"] [aria-label="terpetakan"]').count()).resolves.toBe(1);
		await expect(dialog.locator('[data-testid="check-scenario"] [aria-label="terpetakan"]').count()).resolves.toBe(1);
		await expect(dialog.locator('[data-testid="check-title"] [aria-label="terpetakan"]').count()).resolves.toBe(1);

		await dialog.locator('button:has-text("Simpan")').dispatchEvent('click');
		await list.locator('[role="listitem"]', { hasText: 'V5' }).waitFor({ state: 'visible', timeout: 15000 });

		const row = (await pool.query("SELECT id_template, gid, column_mapping, export_anchors, is_default FROM test_case_templates WHERE version_label = 'V5'")).rows[0];
		expect(row).toBeDefined();
		expect(row.gid).toBe('603972469');
		expect(row.is_default).toBe(false);
		expect(row.column_mapping.test_type).toBeUndefined();
		expect(row.column_mapping.process_no.aliases).toEqual(['Prosess No (FC)']);
		expect(row.export_anchors).toEqual({ sheet_name: 'CONTOH TEST CASE', header_row: 8, data_start_row: 9 });
		v5Id = Number(row.id_template);
	});

	it('TC1-4: pindah default ke V5 lalu kembali ke V4 — selalu tepat satu default', async () => {
		expect((await api('PATCH', `/test-case-templates/${v5Id}/default`, adminToken)).result).toMatchObject({ is_default: true });
		const defaults = async () => (await pool.query('SELECT version_label FROM test_case_templates WHERE is_default')).rows.map((r) => r.version_label);
		expect(await defaults()).toEqual(['V5']);
		expect((await api('PATCH', `/test-case-templates/${v4Id}/default`, adminToken)).status).toBe(200);
		expect(await defaults()).toEqual(['V4']);
	});

	// ---------------------------------------------------------------- PB-2 import (UI → API → DB)
	const importFromUrl = async (page: Page, url: string) => {
		const dialog = page.locator(`${FAB} .k-modal-overlay[role="dialog"]`);
		await dialog.locator('input[placeholder*="docs.google.com"]').fill(url);
		await dialog.locator('button:has-text("Tarik Data Spreadsheet")').dispatchEvent('click');
		const submit = dialog.locator('button:has-text("Test Case")', { hasText: /^Import \d+/ });
		await submit.waitFor({ state: 'visible', timeout: 45000 });
		const summary = await dialog.innerText();
		await submit.dispatchEvent('click');
		await dialog.waitFor({ state: 'detached', timeout: 30000 });
		return summary;
	};

	it('TC3-1: import tab CONTOH asli — Scenario/Test Case terpisah, sel merge diwariskan, Date terimpor', async () => {
		const { page } = harness;
		await openProject(page, seeded.project.name);
		await page.locator(`${FAB} button:has-text("Import Excel / CSV")`).dispatchEvent('click');
		const summary = await importFromUrl(page, CONTOH_URL);
		expect(summary).toContain('Ditemukan 10 skenario');
		expect(summary).toContain('TC1-1'); // peringatan Test Case ID duplikat (2 blok PB)

		const rows = (
			await pool.query(
				'SELECT test_case_id, title, scenario, group_no, feature, process_no, test_type, status, test_date FROM test_cases WHERE id_project = $1 ORDER BY test_case_id',
				[seeded.project.id]
			)
		).rows;
		const byId = Object.fromEntries(rows.map((r) => [r.test_case_id, r]));
		expect(rows).toHaveLength(1 + 9); // test case seed + 9 ID unik (TC1-1 dua kali → ditimpa)
		expect(byId['TC1-2']).toMatchObject({
			title: 'Test Tambah item Katalog pada Order Kain',
			scenario: 'MENGUJI EDIT ORDER PERUBAHAN QTY',
			group_no: '1',
			feature: 'Pengecekan Perubahan Qty Order',
			process_no: 'FC 2C.18.9.21 - Proses 2',
			status: 'Progress',
			test_date: '19/09/24'
		});
		expect(byId['TC1-3']).toMatchObject({ status: 'Failed', test_date: '20/09/24' });
		expect(byId['TC2-3']).toMatchObject({ process_no: 'FC 2C.6.2 - Proses 21', scenario: expect.stringContaining('MEMASTIKAN BUTTON KONFIRMASI') });
		expect(byId['TC3-3']).toMatchObject({ group_no: '3', scenario: null, feature: 'Page Status Order' });
		// TC1-1 terakhir berasal dari blok PB kedua
		expect(byId['TC1-1'].feature).toBe("Penjagaan Button 'Beli' atau 'Minta Sample'");
	});

	it('TC5-2: tabel test case menampilkan Scenario dan Date', async () => {
		const { page } = harness;
		await page.locator(`${FAB} >> text=Test Tambah item Katalog pada Order Kain`).first().waitFor({ state: 'visible', timeout: 15000 });
		expect(await page.locator(`${FAB} >> text=Date: 20/09/24`).count()).toBeGreaterThan(0);
		expect(await page.locator(`${FAB} >> text=MENGUJI EDIT ORDER PERUBAHAN QTY`).count()).toBeGreaterThan(0);
	});

	it('TC3-2: re-import spreadsheet yang sama meng-update, bukan menduplikasi', async () => {
		const { page } = harness;
		const before = Number((await pool.query('SELECT COUNT(*) AS n FROM test_cases WHERE id_project = $1', [seeded.project.id])).rows[0].n);
		await page.locator(`${FAB} button:has-text("Import Excel / CSV")`).dispatchEvent('click');
		await importFromUrl(page, CONTOH_URL);
		await page.locator(`${FAB} >> text=/0 baru, 10 diperbarui/`).first().waitFor({ state: 'visible', timeout: 15000 });
		const after = Number((await pool.query('SELECT COUNT(*) AS n FROM test_cases WHERE id_project = $1', [seeded.project.id])).rows[0].n);
		expect(after).toBe(before);
	});

	it('TC3-3: "Template Sistem" memakai URL template default dari API dan mengimpor tab V4 asli', async () => {
		const { page } = harness;
		await openProject(page, 'Project V4 Kosong');
		await page.locator(`${FAB} >> text=Template Sistem`).first().dispatchEvent('click');
		const dialog = page.locator(`${FAB} .k-modal-overlay[role="dialog"]`);
		await dialog.waitFor({ state: 'visible' });
		expect(await dialog.locator('input[placeholder*="docs.google.com"]').inputValue()).toBe(`${SHEET}?gid=1730053292`); // URL template default dari API (seed V4)
		await dialog.locator('button:has-text("Tarik Data Spreadsheet")').dispatchEvent('click');
		const submit = dialog.locator('button', { hasText: /^Import 3 Test Case/ });
		await submit.waitFor({ state: 'visible', timeout: 45000 });
		await submit.dispatchEvent('click');
		await dialog.waitFor({ state: 'detached', timeout: 30000 });

		const rows = (
			await pool.query('SELECT test_case_id, test_type, status, automation_tools FROM test_cases WHERE id_project = $1 ORDER BY test_case_id', [
				emptyProjectId
			])
		).rows;
		expect(rows).toEqual([
			{ test_case_id: 'TC1-1', test_type: '+', status: 'Progress', automation_tools: 'Masuk Test Step' },
			{ test_case_id: 'TC1-2', test_type: '-', status: 'Passed', automation_tools: 'Test Data' },
			{ test_case_id: 'TC1-3', test_type: '+', status: 'Re-Test', automation_tools: 'Tanpa Automation' }
		]);
	});

	// ---------------------------------------------------------------- PB-4 metadata (API + UI)
	it('TC5-1: metadata project tersimpan lalu bisa dikosongkan', async () => {
		const set = await api('PUT', `/projects/${emptyProjectId}`, adminToken, { tester_name: 'Hana', ip_dev: '10.0.0.5' });
		expect(set.status).toBe(200);
		expect(set.result).toMatchObject({ tester_name: 'Hana', ip_dev: '10.0.0.5', brd_id: null });
		await api('PUT', `/projects/${emptyProjectId}`, adminToken, { tester_name: '' });
		const row = (await pool.query('SELECT tester_name, ip_dev FROM projects WHERE id_project = $1', [emptyProjectId])).rows[0];
		expect(row).toEqual({ tester_name: null, ip_dev: '10.0.0.5' });
	});

	// ---------------------------------------------------------------- PB-3 ekspor
	it('TC4-3 (bagian UI): metadata diisi lewat form Edit Project', async () => {
		const { page } = harness;
		await openProject(page, seeded.project.name);
		await page.locator(`${FAB} button[title="Edit Project"]`).first().dispatchEvent('click');
		const dialog = page.locator(`${FAB} .k-modal-overlay[role="dialog"]`);
		await dialog.waitFor({ state: 'visible' });
		await dialog.locator('button:has-text("Metadata Format Test Case V4")').dispatchEvent('click');
		await dialog.getByLabel('Tester', { exact: true }).fill('Hana');
		await dialog.getByLabel('Programmer', { exact: true }).fill('Ridwan');
		await dialog.getByLabel('BRD ID', { exact: true }).fill('BRD608');
		await dialog.getByLabel('Link Figma', { exact: true }).fill('https://figma.com/file/abc');
		await dialog.locator('button:has-text("Simpan Perubahan")').dispatchEvent('click');
		await dialog.waitFor({ state: 'detached', timeout: 15000 });
		const row = (await pool.query('SELECT tester_name, programmer_name, brd_id, link_figma FROM projects WHERE id_project = $1', [seeded.project.id])).rows[0];
		expect(row).toEqual({ tester_name: 'Hana', programmer_name: 'Ridwan', brd_id: 'BRD608', link_figma: 'https://figma.com/file/abc' });
	});

	let v4File = '';
	it('TC4-1: tombol "Ekspor V4 (.xlsx)" mengunduh file berlayout V4', async () => {
		const { page } = harness;
		await openProject(page, seeded.project.name);
		const [download] = await Promise.all([
			page.waitForEvent('download', { timeout: 60000 }),
			page.locator(`${FAB} button:has-text("Ekspor V4 (.xlsx)")`).dispatchEvent('click')
		]);
		expect(download.suggestedFilename()).toBe(`${seeded.project.code.toLowerCase()}-test-case-v4.xlsx`);
		v4File = path.join(downloadDir, download.suggestedFilename());
		await download.saveAs(v4File);

		const wb = await readWorkbook(v4File);
		expect(wb.worksheets.map((s) => s.name)).toEqual(['FORMAT TEST CASE V4']);
		const ws = wb.worksheets[0];
		expect(ws.getCell('G18').value).toBe('Scenario');
		expect(ws.getCell('H18').value).toBe('Test Case');
		const ids = Array.from({ length: 10 }, (_, i) => ws.getCell(`E${19 + i}`).value);
		expect(ids).toContain('TC1-2');
		expect(ids).toContain(seeded.testCase.testCaseNo);
	});

	it('TC4-2: Summary & dropdown mencakup semua baris (> 3), Status + Skip', async () => {
		const ws = (await readWorkbook(v4File)).worksheets[0];
		expect(formula(ws, 'B7')).toBe('COUNTA(E19:E992)');
		expect(formula(ws, 'D9')).toBe('COUNTIF($P$19:$P$28,C9)');
		for (let row = 19; row <= 28; row++) {
			expect(ws.getCell(`M${row}`).dataValidation?.formulae).toEqual(['"Progress,Passed,Failed,Re-Test,Skip"']);
			expect(ws.getCell(`D${row}`).dataValidation?.type).toBe('list');
			expect(ws.getCell(`P${row}`).dataValidation?.type).toBe('list');
		}
		const filled = Array.from({ length: 974 }, (_, i) => ws.getCell(`E${19 + i}`).value).filter((v) => v !== null && v !== '');
		expect(filled).toHaveLength(10); // COUNTA(E19:E992) = Total Test Case
		const statuses = Array.from({ length: 10 }, (_, i) => ws.getCell(`M${19 + i}`).value);
		expect(statuses.filter((s) => s === 'Passed').length).toBe(1);
		expect(statuses.filter((s) => s === 'Failed').length).toBe(1);
	});

	it('TC4-3: metadata header & blok PB terisi dari project', async () => {
		const ws = (await readWorkbook(v4File)).worksheets[0];
		expect(ws.getCell('F1').value).toBe('Hana');
		expect(ws.getCell('F2').value).toBe('Ridwan');
		expect(ws.getCell('B2').value).toBe('-');
		expect(ws.getCell('A17').value).toBe('BRD608');
		expect(ws.getCell('R17').value).toEqual({ text: 'https://figma.com/file/abc', hyperlink: 'https://figma.com/file/abc' });
		expect(ws.getCell('K13').value).toBe(true);
		expect(String(ws.getCell('L13').value)).toMatch(/TC/);
	});

	it('TC4-4: ekspor dengan template V5 (tab CONTOH, header berbeda) tanpa ubah kode', async () => {
		const res = await fetch(`${backend.baseUrl}/projects/${seeded.project.id}/test-cases/export?template=${v5Id}`, {
			headers: { Authorization: `Bearer ${adminToken}` }
		});
		expect(res.status).toBe(200);
		expect(res.headers.get('content-disposition')).toContain('-test-case-v5.xlsx');
		const file = path.join(downloadDir, 'v5.xlsx');
		fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
		const wb = await readWorkbook(file);
		expect(wb.worksheets.map((s) => s.name)).toEqual(['CONTOH TEST CASE']);
		const ws = wb.worksheets[0];
		expect(ws.getCell('F8').value).toBe('Scenario');
		const rows = Array.from({ length: 10 }, (_, i) => ({ id: ws.getCell(`D${9 + i}`).value, scenario: ws.getCell(`F${9 + i}`).value, title: ws.getCell(`G${9 + i}`).value }));
		expect(rows).toContainEqual({ id: 'TC1-2', scenario: 'MENGUJI EDIT ORDER PERUBAHAN QTY', title: 'Test Tambah item Katalog pada Order Kain' });
	});

	it('TC4-5: ekspor project di luar assignment ditolak; template tidak ada → 404', async () => {
		expect((await api('GET', `/projects/${seeded.project.id}/test-cases/export`, qaToken)).status).toBe(403);
		expect((await api('GET', `/projects/${emptyProjectId}/test-cases/export?template=99999`, qaToken)).status).toBe(404);
	});

	// ---------------------------------------------------------------- PB-1 UI (QA)
	it('TC2-3: user QA tidak melihat kartu Template Test Case di Pengaturan', async () => {
		const { page } = harness;
		await logout(page);
		await openFabAs(page, otherQa.username, otherQa.password);
		await page.locator(`${FAB} button[aria-label="Setting"]`).dispatchEvent('click');
		await page.locator(`${FAB} >> text="Pengaturan Sidebar"`).first().waitFor({ state: 'visible', timeout: 15000 });
		expect(await page.locator(`${FAB} >> text=Template Test Case`).count()).toBe(0);
	});
});
