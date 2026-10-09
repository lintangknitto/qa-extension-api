import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { buildSpecRows, fillTemplateWorksheet, widenFormulaRanges } from '../../domain/test-case-export';
import { loadWorkbook } from '../../services/template-workbook.service';

const FIXTURE = path.join(__dirname, '../fixtures/format-test-case-v4.xlsx');

// Pemetaan & anchor sama dengan seed migration 002 (template V4 default).
const V4_MAPPING = {
	group_no: { header: 'Group No' },
	feature: { header: 'Feature' },
	process_no: { header: 'Process No (FC)' },
	test_type: { header: 'TYPE' },
	test_case_id: { header: 'Test Case ID' },
	test_variable: { header: 'Test Variable' },
	scenario: { header: 'Scenario' },
	title: { header: 'Test Case' },
	pre_condition: { header: 'Pre-Condition' },
	test_data: { header: 'Test Data' },
	test_steps: { header: 'Test Steps' },
	expected_result: { header: 'Expected Result' },
	status: { header: 'Status' },
	evidence: { header: 'Evidence' },
	remarks: { header: 'Remarks' },
	automation_tools: { header: 'Automation Tools' },
	test_date: { header: 'Date' }
};
const V4_ANCHORS = {
	sheet_name: 'FORMAT TEST CASE V4',
	metadata: {
		release_version: 'B1', test_app_folder: 'B2', ip_dev: 'B3', ip_prod: 'B4',
		tester_name: 'F1', programmer_name: 'F2', task_dev: 'F3', created_at: 'J1', updated_at: 'J2'
	},
	header_row: 18,
	data_start_row: 19,
	pb_block: {
		spec_start_row: 13, spec_end_row: 16, spec_no_column: 'B', spec_text_column: 'C',
		checkbox_column: 'K', test_case_id_column: 'L', brd_id_cell: 'A17', link_task_cell: 'B17', link_figma_cell: 'R17'
	}
};

const project: Entity.IQaProject = {
	id_project: 1,
	code: 'chat-widget',
	release_version: 'v2.3.0',
	tester_name: 'Hana',
	programmer_name: 'Ridwan',
	brd_id: 'BRD608',
	link_task_pb: 'https://tasks.example/PB-1',
	link_figma: 'https://figma.com/file/abc'
};

const tc = (n: number, status: string, automation: string, extra: Partial<Entity.IQaTestCase> = {}): Entity.IQaTestCase => ({
	test_case_id: `TC1-${n}`,
	title: `Kirim pesan ${n}`,
	scenario: 'Kirim pesan teks',
	feature: n <= 3 ? 'Chat' : 'Upload',
	group_no: '1',
	process_no: `FC${n}`,
	test_type: n % 2 ? '+' : '-',
	status,
	automation_tools: automation,
	test_date: '8 Oktober 2026',
	created_at: `2026-10-0${n}T08:00:00Z`,
	updated_at: `2026-10-0${n}T09:00:00Z`,
	...extra
});

const FIVE = [
	tc(1, 'Passed', 'Test Data'),
	tc(2, 'Failed', 'Masuk Test Step'),
	tc(3, 'Passed', 'Tanpa Automation'),
	tc(4, 'Skip', 'Test Data'),
	tc(5, 'Re-Test', 'Masuk Test Step')
];

/** Ekspor ke buffer lalu baca ulang, seperti file yang dibuka user. */
const exportRoundTrip = async (testCases: Entity.IQaTestCase[], proj = project) => {
	const workbook = await loadWorkbook(fs.readFileSync(FIXTURE));
	const result = fillTemplateWorksheet({
		worksheet: workbook.worksheets[0],
		columnMapping: V4_MAPPING,
		anchors: V4_ANCHORS,
		project: proj,
		testCases
	});
	const reread = await loadWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
	return { ws: reread.worksheets[0], result };
};

// Evaluator mini untuk rumus Summary V4: COUNTA(range) dan COUNTIF(range, sel).
const evaluate = (ws: ExcelJS.Worksheet, address: string): number => {
	const value = ws.getCell(address).value as { formula?: string };
	const formula = value?.formula ?? '';
	const range = (ref: string) => {
		const [, c1, r1, , r2] = /\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)/.exec(ref)!;
		const cells: unknown[] = [];
		for (let r = Number(r1); r <= Number(r2); r++) cells.push(ws.getCell(`${c1}${r}`).value);
		return cells;
	};
	let m = /^COUNTA\(([^)]+)\)$/.exec(formula);
	if (m) return range(m[1]).filter((v) => v !== null && v !== undefined && v !== '').length;
	m = /^COUNTIF\(([^,]+),([A-Z]+\d+)\)$/.exec(formula);
	if (m) {
		const criterion = ws.getCell(m[2]).value;
		return range(m[1]).filter((v) => v === criterion).length;
	}
	throw new Error(`rumus tidak didukung: ${formula}`);
};

describe('test-case-export (template V4 asli)', () => {
	it('mengisi baris test case sesuai 17 kolom pemetaan, termasuk Scenario dan Date', async () => {
		const { ws, result } = await exportRoundTrip(FIVE);
		expect(result).toEqual({ headerRow: 18, dataStartRow: 19, lastDataRow: 23 });
		expect(ws.getRow(19).values).toEqual([
			undefined, '1', 'Chat', 'FC1', '+', 'TC1-1', undefined, 'Kirim pesan teks', 'Kirim pesan 1',
			undefined, undefined, undefined, undefined, 'Passed', undefined, undefined, 'Test Data', '8 Oktober 2026'
		]);
		expect(ws.getCell('E23').value).toBe('TC1-5');
		expect(ws.getCell('M23').value).toBe('Re-Test');
		// Header tabel tidak tersentuh
		expect(ws.getCell('G18').value).toBe('Scenario');
		expect(ws.getCell('H18').value).toBe('Test Case');
	});

	it('baris tambahan memakai style baris contoh pertama', async () => {
		const { ws } = await exportRoundTrip(FIVE);
		for (const col of ['A', 'E', 'M', 'Q']) {
			expect(ws.getCell(`${col}23`).style.border).toEqual(ws.getCell(`${col}19`).style.border);
			expect(ws.getCell(`${col}23`).style.font).toEqual(ws.getCell(`${col}19`).style.font);
		}
	});

	it('Summary menghitung benar untuk > 3 baris (rumus diperlebar, bukan dipersempit)', async () => {
		const { ws } = await exportRoundTrip(FIVE);
		expect((ws.getCell('B7').value as { formula: string }).formula).toBe('COUNTA(E19:E992)');
		expect((ws.getCell('D9').value as { formula: string }).formula).toBe('COUNTIF($P$19:$P$23,C9)');
		expect((ws.getCell('B7').value as { result?: unknown }).result).toBeUndefined();

		expect(evaluate(ws, 'B7')).toBe(5); // Total Test Case
		expect(evaluate(ws, 'D7')).toBe(2); // Passed
		expect(evaluate(ws, 'F7')).toBe(1); // Failed
		expect(evaluate(ws, 'I7')).toBe(1); // Re-Test
		expect(evaluate(ws, 'K7')).toBe(1); // Skip
		expect(evaluate(ws, 'D9')).toBe(2); // Test Data
		expect(evaluate(ws, 'F9')).toBe(2); // Masuk Test Step
		expect(evaluate(ws, 'I9')).toBe(1); // Tanpa Automation
		// B9 = D9+F9, K9 = B9/B7 → 80% > 24% → "Memenuhi Syarat"
		expect((ws.getCell('B9').value as { formula: string }).formula).toBe('D9+F9');
		expect((ws.getCell('L9').value as { formula: string }).formula).toContain('K9>24%');
	});

	it('dropdown TYPE, Status (+Skip), dan Automation Tools berlaku di semua baris data', async () => {
		const { ws } = await exportRoundTrip(FIVE);
		for (let row = 19; row <= 23; row++) {
			expect(ws.getCell(`D${row}`).dataValidation?.formulae).toEqual(['"\'+,\'-"']);
			expect(ws.getCell(`M${row}`).dataValidation?.formulae).toEqual(['"Progress,Passed,Failed,Re-Test,Skip"']);
			expect(ws.getCell(`P${row}`).dataValidation?.formulae).toEqual(['"Test Data,Masuk Test Step,Tanpa Automation"']);
		}
		expect(ws.getCell('M24').dataValidation).toBeUndefined();
	});

	it('baris contoh template dibersihkan bila test case lebih sedikit; validasi tetap sampai baris contoh', async () => {
		const { ws, result } = await exportRoundTrip([tc(1, 'Passed', 'Test Data')]);
		expect(result.lastDataRow).toBe(21);
		expect(ws.getCell('E20').value).toBeNull();
		expect(ws.getCell('E21').value).toBeNull();
		expect(ws.getCell('M21').dataValidation?.formulae).toEqual(['"Progress,Passed,Failed,Re-Test,Skip"']);
		expect(evaluate(ws, 'B7')).toBe(1);
	});

	it('metadata header dari project; kosong → "-"; CREATED/UPDATED AT dari test case terlama/terbaru', async () => {
		const { ws } = await exportRoundTrip(FIVE);
		expect(ws.getCell('B1').value).toBe('v2.3.0');
		expect(ws.getCell('B2').value).toBe('-');
		expect(ws.getCell('B3').value).toBe('-');
		expect(ws.getCell('F1').value).toBe('Hana');
		expect(ws.getCell('F2').value).toBe('Ridwan');
		expect(ws.getCell('F3').value).toBe('-');
		expect((ws.getCell('J1').value as Date).toISOString()).toBe('2026-10-01T08:00:00.000Z');
		expect((ws.getCell('J2').value as Date).toISOString()).toBe('2026-10-05T09:00:00.000Z');
		expect(ws.getCell('J1').numFmt).toBe('d mmmm yyyy');
	});

	it('blok PB: BRD, link task/figma, dan traceability per fitur dengan checkbox', async () => {
		const { ws } = await exportRoundTrip(FIVE);
		expect(ws.getCell('A17').value).toBe('BRD608');
		expect(ws.getCell('B17').value).toEqual({ text: 'LINK TASK PB', hyperlink: 'https://tasks.example/PB-1' });
		expect(ws.getCell('R17').value).toEqual({ text: 'https://figma.com/file/abc', hyperlink: 'https://figma.com/file/abc' });
		expect([ws.getCell('B13').value, ws.getCell('C13').value, ws.getCell('K13').value, ws.getCell('L13').value]).toEqual([
			1, 'Chat', true, 'TC1-1, TC1-2, TC1-3'
		]);
		expect([ws.getCell('C14').value, ws.getCell('L14').value]).toEqual(['Upload', 'TC1-4, TC1-5']);
	});

	it('project tanpa BRD/link: BRD jadi "-", label link dibiarkan', async () => {
		const { ws } = await exportRoundTrip(FIVE, { id_project: 1, code: 'x' });
		expect(ws.getCell('A17').value).toBe('-');
		expect(ws.getCell('B17').value).toBe('LINK TASK PB');
		expect(ws.getCell('R17').value).toBeNull();
	});
});

describe('helper ekspor', () => {
	it('widenFormulaRanges hanya memperlebar rentang yang mulai di baris data pertama', () => {
		expect(widenFormulaRanges('COUNTIF($M$19:$M$21,C7)', 19, 40)).toBe('COUNTIF($M$19:$M$40,C7)');
		expect(widenFormulaRanges('COUNTA(E19:E992)', 19, 40)).toBe('COUNTA(E19:E992)');
		expect(widenFormulaRanges('SUM(A1:A5)', 19, 40)).toBe('SUM(A1:A5)');
	});

	it('buildSpecRows menggabungkan sisa spesifikasi di slot terakhir agar tak ada TC yang hilang', () => {
		const cases = ['A', 'B', 'C', 'D', 'E', 'F'].map((feature, i) => ({ feature, test_case_id: `TC${i + 1}` }));
		const rows = buildSpecRows(cases, 4);
		expect(rows).toHaveLength(4);
		expect(rows[3]).toEqual({ text: 'D; E; F', ids: ['TC4', 'TC5', 'TC6'] });
		expect(buildSpecRows([{ scenario: 'S1', test_case_id: 'TC1' }], 4)).toEqual([{ text: 'S1', ids: ['TC1'] }]);
	});
});
