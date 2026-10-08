import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import {
	buildXlsxExportUrl,
	downloadTemplateWorkbook,
	extractSpreadsheetId,
	findHeaderRow,
	selectTemplateSheet
} from '../../services/template-workbook.service';

const FIXTURE = path.join(__dirname, '../fixtures/format-test-case-v4.xlsx');
const mapping = { test_case_id: { header: 'Test Case ID' }, title: { header: 'Test Case', aliases: ['Judul'] } };

const buildWorkbook = () => {
	const wb = new ExcelJS.Workbook();
	wb.addWorksheet('CONTOH').getRow(3).values = ['No', 'Judul'];
	const v5 = wb.addWorksheet('FORMAT V5');
	v5.getRow(5).values = ['Grup', 'Test Case ID', 'Judul'];
	wb.addWorksheet('MATRIC');
	return wb;
};

describe('template-workbook.service', () => {
	afterEach(() => jest.restoreAllMocks());

	it('membangun URL ekspor xlsx hanya dari ID spreadsheet', () => {
		const url = 'https://docs.google.com/spreadsheets/d/1k_08EdNZUBGBhLNU-FIPxqm06PpCfn4Dyprc4sDYCsI/edit?gid=1730053292#gid=1730053292';
		expect(extractSpreadsheetId(url)).toBe('1k_08EdNZUBGBhLNU-FIPxqm06PpCfn4Dyprc4sDYCsI');
		expect(buildXlsxExportUrl(url)).toBe(
			'https://docs.google.com/spreadsheets/d/1k_08EdNZUBGBhLNU-FIPxqm06PpCfn4Dyprc4sDYCsI/export?format=xlsx'
		);
		expect(() => extractSpreadsheetId('https://evil.example/spreadsheets/d/abc')).toThrow('bukan link Google Spreadsheet');
	});

	it('memilih tab berdasarkan sheet_name dan membuang tab lain', () => {
		const wb = buildWorkbook();
		const ws = selectTemplateSheet(wb, { spreadsheet_url: '', column_mapping: mapping, export_anchors: { sheet_name: 'format v5' } });
		expect(ws.name).toBe('FORMAT V5');
		expect(wb.worksheets.map((s) => s.name)).toEqual(['FORMAT V5']);
	});

	it('tanpa sheet_name: memilih tab pertama yang header-nya cocok dengan pemetaan (alias ikut dihitung)', () => {
		const wb = buildWorkbook();
		const ws = selectTemplateSheet(wb, { spreadsheet_url: '', column_mapping: mapping, export_anchors: {} });
		expect(ws.name).toBe('FORMAT V5');
		expect(findHeaderRow(ws, { spreadsheet_url: '', column_mapping: mapping, export_anchors: {} })).toBe(5);
	});

	it('melempar error jelas bila tab tidak ditemukan', () => {
		expect(() =>
			selectTemplateSheet(buildWorkbook(), { spreadsheet_url: '', column_mapping: mapping, export_anchors: { sheet_name: 'V9' } })
		).toThrow('Tab "V9" tidak ditemukan');
		expect(() =>
			selectTemplateSheet(buildWorkbook(), {
				spreadsheet_url: '',
				column_mapping: { test_case_id: { header: 'X' }, title: { header: 'Y' } },
				export_anchors: {}
			})
		).toThrow('header-nya cocok');
	});

	it('mengunduh xlsx dari Google dan menyisakan tab template', async () => {
		const buffer = fs.readFileSync(FIXTURE);
		const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
			new Response(buffer, { status: 200, headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } })
		);
		const { workbook, worksheet } = await downloadTemplateWorkbook({
			spreadsheet_url: 'https://docs.google.com/spreadsheets/d/abc/edit',
			column_mapping: mapping,
			export_anchors: { sheet_name: 'FORMAT TEST CASE V4', header_row: 18 }
		});
		expect(fetchMock.mock.calls[0][0]).toBe('https://docs.google.com/spreadsheets/d/abc/export?format=xlsx');
		expect(worksheet.name).toBe('FORMAT TEST CASE V4');
		expect(workbook.worksheets).toHaveLength(1);
	});

	it('menolak respons non-xlsx (mis. halaman login Google untuk sheet privat)', async () => {
		jest.spyOn(global, 'fetch').mockResolvedValue(new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }));
		await expect(
			downloadTemplateWorkbook({ spreadsheet_url: 'https://docs.google.com/spreadsheets/d/abc', column_mapping: mapping, export_anchors: {} })
		).rejects.toThrow('dapat diakses publik');

		jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ETIMEDOUT'));
		await expect(
			downloadTemplateWorkbook({ spreadsheet_url: 'https://docs.google.com/spreadsheets/d/abc', column_mapping: mapping, export_anchors: {} })
		).rejects.toThrow('Gagal mengunduh');
	});
});
