import ExcelJS from 'exceljs';
import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';

const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_HEADER_SCAN_ROWS = 40;

export interface ITemplateSheetSource {
	spreadsheet_url: string;
	column_mapping: Record<string, { header: string; aliases?: string[] }>;
	export_anchors: { sheet_name?: string; header_row?: number };
}

/** Ambil ID spreadsheet dari URL Google Sheets (`/spreadsheets/d/<id>/...`). */
export const extractSpreadsheetId = (spreadsheetUrl: string): string => {
	const match = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/.exec(spreadsheetUrl.trim());
	if (!match) throw new InvalidParameterException('URL template bukan link Google Spreadsheet.');
	return match[1];
};

/**
 * URL unduhan xlsx dibangun ulang dari ID saja (bukan URL mentah dari admin), jadi request
 * keluar selalu ke docs.google.com. Google mengekspor seluruh workbook; tab dipilih setelahnya.
 */
export const buildXlsxExportUrl = (spreadsheetUrl: string): string =>
	`https://docs.google.com/spreadsheets/d/${extractSpreadsheetId(spreadsheetUrl)}/export?format=xlsx`;

/** Teks dari nilai primitif; object (selain Date) dianggap kosong. */
export const toText = (value: unknown): string => {
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
	return '';
};

export const normalizeHeader = (value: unknown): string =>
	toText(value)
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();

const cellText = (value: ExcelJS.CellValue): string => {
	if (value && typeof value === 'object' && 'richText' in value) return value.richText.map((part) => part.text).join('');
	if (value && typeof value === 'object' && 'text' in value) return toText(value.text);
	return toText(value);
};

/** Peta header ternormalisasi → nomor kolom untuk satu baris. */
export const readHeaderRow = (worksheet: ExcelJS.Worksheet, rowNumber: number): Map<string, number> => {
	const headers = new Map<string, number>();
	worksheet.getRow(rowNumber).eachCell((cell, col) => {
		const key = normalizeHeader(cellText(cell.value));
		if (key && !headers.has(key)) headers.set(key, col);
	});
	return headers;
};

const headerCandidates = (column: { header: string; aliases?: string[] }): string[] =>
	[column.header, ...(column.aliases ?? [])].map(normalizeHeader).filter(Boolean);

/** Kolom untuk sebuah field: header utama dulu, lalu alias. */
export const resolveColumn = (
	headers: Map<string, number>,
	column: { header: string; aliases?: string[] } | undefined
): number | undefined => {
	if (!column) return undefined;
	for (const candidate of headerCandidates(column)) {
		const col = headers.get(candidate);
		if (col) return col;
	}
	return undefined;
};

/** Baris header = baris pertama yang memuat kolom wajib (test_case_id & title). */
export const findHeaderRow = (worksheet: ExcelJS.Worksheet, source: ITemplateSheetSource): number | undefined => {
	const required = [source.column_mapping.test_case_id, source.column_mapping.title];
	const rows = source.export_anchors.header_row
		? [source.export_anchors.header_row]
		: Array.from({ length: MAX_HEADER_SCAN_ROWS }, (_, i) => i + 1);
	return rows.find((row) => {
		const headers = readHeaderRow(worksheet, row);
		return required.every((column) => resolveColumn(headers, column) !== undefined);
	});
};

/**
 * Pilih tab template: `export_anchors.sheet_name` bila ada, selain itu tab pertama yang header-nya
 * cocok dengan pemetaan kolom. Tab lain dibuang supaya file ekspor hanya berisi format yang dipakai.
 */
export const selectTemplateSheet = (workbook: ExcelJS.Workbook, source: ITemplateSheetSource): ExcelJS.Worksheet => {
	const sheetName = source.export_anchors.sheet_name?.trim();
	const selected = sheetName
		? workbook.worksheets.find((sheet) => sheet.name.trim().toLowerCase() === sheetName.toLowerCase())
		: workbook.worksheets.find((sheet) => findHeaderRow(sheet, source) !== undefined);

	if (!selected) {
		throw new InvalidParameterException(
			sheetName
				? `Tab "${sheetName}" tidak ditemukan di spreadsheet template.`
				: 'Tidak ada tab di spreadsheet template yang header-nya cocok dengan pemetaan kolom.'
		);
	}

	for (const sheet of [...workbook.worksheets]) {
		if (sheet.id !== selected.id) workbook.removeWorksheet(sheet.id);
	}
	selected.state = 'visible';
	workbook.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];
	return selected;
};

export const loadWorkbook = async (buffer: ArrayBuffer | Buffer): Promise<ExcelJS.Workbook> => {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(buffer);
	return workbook;
};

/** Unduh template sebagai xlsx dan sisakan hanya tab template. */
export const downloadTemplateWorkbook = async (
	source: ITemplateSheetSource
): Promise<{ workbook: ExcelJS.Workbook; worksheet: ExcelJS.Worksheet }> => {
	let response: Response;
	try {
		response = await fetch(buildXlsxExportUrl(source.spreadsheet_url), {
			redirect: 'follow',
			signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
		});
	} catch {
		throw new InvalidParameterException('Gagal mengunduh spreadsheet template. Periksa koneksi dan akses link template.');
	}
	const contentType = response.headers.get('content-type') ?? '';
	if (!response.ok || !contentType.includes('spreadsheetml')) {
		throw new InvalidParameterException(
			'Spreadsheet template tidak bisa diunduh sebagai xlsx. Pastikan link template dapat diakses publik ("Siapa saja yang memiliki link").'
		);
	}

	const workbook = await loadWorkbook(await response.arrayBuffer());
	return { workbook, worksheet: selectTemplateSheet(workbook, source) };
};
