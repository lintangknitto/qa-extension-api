import type ExcelJS from 'exceljs';
import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { findHeaderRow, readHeaderRow, resolveColumn, toText } from '../services/template-workbook.service';

export type TColumnMapping = Record<string, { header: string; aliases?: string[] }>;

export interface IPbBlockAnchors {
	spec_start_row?: number;
	spec_end_row?: number;
	spec_no_column?: string;
	spec_text_column?: string;
	checkbox_column?: string;
	test_case_id_column?: string;
	brd_id_cell?: string;
	link_task_cell?: string;
	link_figma_cell?: string;
}

export interface IExportAnchors {
	sheet_name?: string;
	metadata?: Record<string, string>;
	header_row?: number;
	data_start_row?: number;
	pb_block?: IPbBlockAnchors;
}

export interface IExportInput {
	worksheet: ExcelJS.Worksheet;
	columnMapping: TColumnMapping;
	anchors: IExportAnchors;
	project: Entity.IQaProject;
	testCases: Entity.IQaTestCase[];
}

const EMPTY = '-';
const SKIP_STATUS = 'Skip';

const isBlank = (value: unknown): boolean => value === null || value === undefined || (typeof value !== 'object' && toText(value).trim() === '');

const toDate = (value: unknown): Date | null => {
	if (isBlank(value)) return null;
	const date = value instanceof Date ? value : new Date(toText(value));
	return Number.isNaN(date.getTime()) ? null : date;
};

const pickDate = (testCases: Entity.IQaTestCase[], field: 'created_at' | 'updated_at', pick: 'min' | 'max'): Date | null => {
	const dates = testCases.map((tc) => toDate(tc[field])).filter((d): d is Date => d !== null);
	if (dates.length === 0) return null;
	return dates.reduce((a, b) => ((pick === 'min' ? b < a : b > a) ? b : a));
};

const cloneStyle = (style: Partial<ExcelJS.Style>): Partial<ExcelJS.Style> => JSON.parse(JSON.stringify(style ?? {}));

const rowHasData = (worksheet: ExcelJS.Worksheet, row: number, columns: number[]): boolean =>
	columns.some((col) => !isBlank(worksheet.getCell(row, col).value));

/** Nilai sel untuk satu field test case. */
const fieldValue = (testCase: Entity.IQaTestCase, field: string): ExcelJS.CellValue => {
	const raw = (testCase as Record<string, unknown>)[field];
	if (isBlank(raw)) return null;
	return toText(raw);
};

/**
 * Perlebar rentang yang dimulai di baris data pertama (mis. `E19:E992`, `$P$19:$P$21`) sampai baris
 * data terakhir. Rentang tidak pernah dipersempit: baris kosong sisa template tetap ikut dihitung.
 */
export const widenFormulaRanges = (formula: string, dataStartRow: number, lastDataRow: number): string =>
	formula.replace(
		/(\$?[A-Z]{1,3}\$?)(\d+):(\$?[A-Z]{1,3}\$?)(\d+)/g,
		(match, startCol: string, startRow: string, endCol: string, endRow: string) => {
			if (Number(startRow) !== dataStartRow) return match;
			return `${startCol}${startRow}:${endCol}${Math.max(Number(endRow), lastDataRow)}`;
		}
	);

const appendSkipToStatusList = (validation: ExcelJS.DataValidation): ExcelJS.DataValidation => {
	if (validation.type !== 'list' || !validation.formulae?.[0]) return validation;
	const list = String(validation.formulae[0]);
	const quoted = /^"(.*)"$/.exec(list);
	if (!quoted) return validation;
	const items = quoted[1].split(',').map((item) => item.trim());
	if (items.some((item) => item.toLowerCase() === SKIP_STATUS.toLowerCase())) return validation;
	return { ...validation, formulae: [`"${[...items, SKIP_STATUS].join(',')}"`] };
};

const setText = (worksheet: ExcelJS.Worksheet, address: string | undefined, value: unknown): void => {
	if (!address) return;
	worksheet.getCell(address).value = isBlank(value) ? EMPTY : (value as ExcelJS.CellValue);
};

/** Link: label yang sudah ada di sel dijadikan hyperlink; sel kosong diisi URL-nya. */
const setLink = (worksheet: ExcelJS.Worksheet, address: string | undefined, url: string | null | undefined): void => {
	if (!address || isBlank(url)) return;
	const cell = worksheet.getCell(address);
	const label = typeof cell.value === 'string' && cell.value.trim() ? cell.value.trim() : String(url);
	cell.value = { text: label, hyperlink: String(url) };
};

interface ISpecRow {
	text: string;
	ids: string[];
}

/** Traceability satu blok PB: satu baris spesifikasi per fitur (fallback scenario / group). */
export const buildSpecRows = (testCases: Entity.IQaTestCase[], slots: number): ISpecRow[] => {
	const specs = new Map<string, ISpecRow>();
	for (const tc of testCases) {
		const text = [tc.feature, tc.scenario, tc.group_no].find((value) => !isBlank(value))?.toString().trim();
		if (!text) continue;
		const spec = specs.get(text) ?? { text, ids: [] };
		if (tc.test_case_id) spec.ids.push(String(tc.test_case_id));
		specs.set(text, spec);
	}
	const rows = [...specs.values()];
	if (slots <= 0 || rows.length <= slots) return rows;

	// Slot terakhir menampung sisa spesifikasi supaya tidak ada test case yang hilang dari traceability.
	const rest = rows.slice(slots - 1);
	return [
		...rows.slice(0, slots - 1),
		{ text: rest.map((spec) => spec.text).join('; '), ids: rest.flatMap((spec) => spec.ids) }
	];
};

const fillPbBlock = (worksheet: ExcelJS.Worksheet, pb: IPbBlockAnchors, project: Entity.IQaProject, testCases: Entity.IQaTestCase[]): void => {
	setText(worksheet, pb.brd_id_cell, project.brd_id);
	setLink(worksheet, pb.link_task_cell, project.link_task_pb);
	setLink(worksheet, pb.link_figma_cell, project.link_figma);

	if (!pb.spec_start_row || !pb.spec_end_row) return;
	const slots = pb.spec_end_row - pb.spec_start_row + 1;
	buildSpecRows(testCases, slots).forEach((spec, index) => {
		const row = pb.spec_start_row + index;
		if (pb.spec_no_column) worksheet.getCell(`${pb.spec_no_column}${row}`).value = index + 1;
		if (pb.spec_text_column) worksheet.getCell(`${pb.spec_text_column}${row}`).value = spec.text;
		if (pb.checkbox_column) worksheet.getCell(`${pb.checkbox_column}${row}`).value = spec.ids.length > 0;
		if (pb.test_case_id_column) worksheet.getCell(`${pb.test_case_id_column}${row}`).value = spec.ids.join(', ');
	});
};

const fillMetadata = (worksheet: ExcelJS.Worksheet, metadata: Record<string, string>, project: Entity.IQaProject, testCases: Entity.IQaTestCase[]): void => {
	for (const [field, address] of Object.entries(metadata)) {
		if (field === 'created_at' || field === 'updated_at') {
			setText(worksheet, address, pickDate(testCases, field, field === 'created_at' ? 'min' : 'max'));
			continue;
		}
		setText(worksheet, address, (project as Record<string, unknown>)[field]);
	}
};

interface ITableLayout {
	headerRow: number;
	dataStartRow: number;
	columns: Array<{ field: string; col: number }>;
	tableColumns: number[];
	lastColumn: number;
	statusCol?: number;
}

const resolveTableLayout = (worksheet: ExcelJS.Worksheet, columnMapping: TColumnMapping, anchors: IExportAnchors): ITableLayout => {
	const headerRow = anchors.header_row ?? findHeaderRow(worksheet, { spreadsheet_url: '', column_mapping: columnMapping, export_anchors: {} });
	if (!headerRow) throw new InvalidParameterException('Baris header tabel test case tidak ditemukan di template.');

	const headers = readHeaderRow(worksheet, headerRow);
	const columns = Object.entries(columnMapping)
		.map(([field, column]) => ({ field, col: resolveColumn(headers, column) }))
		.filter((entry): entry is { field: string; col: number } => entry.col !== undefined);
	if (!columns.some((c) => c.field === 'test_case_id') || !columns.some((c) => c.field === 'title'))
		throw new InvalidParameterException('Kolom Test Case ID / Test Case dari pemetaan tidak ditemukan di header template.');

	const tableColumns = [...headers.values()];
	return {
		headerRow,
		dataStartRow: anchors.data_start_row ?? headerRow + 1,
		columns,
		tableColumns,
		lastColumn: Math.max(...tableColumns),
		statusCol: columns.find((c) => c.field === 'status')?.col
	};
};

/** Simpan style & validasi baris contoh pertama, lalu kosongkan baris contoh (mis. TC1-1..TC1-3). */
const takeSampleRows = (worksheet: ExcelJS.Worksheet, layout: ITableLayout) => {
	let sampleEnd = layout.dataStartRow - 1;
	while (rowHasData(worksheet, sampleEnd + 1, layout.tableColumns)) sampleEnd++;

	const styleRow = worksheet.getRow(layout.dataStartRow);
	const styles = new Map<number, Partial<ExcelJS.Style>>();
	const validations = new Map<number, ExcelJS.DataValidation>();
	for (let col = 1; col <= layout.lastColumn; col++) {
		const cell = styleRow.getCell(col);
		styles.set(col, cloneStyle(cell.style));
		if (cell.dataValidation) validations.set(col, cell.dataValidation);
	}
	for (let row = layout.dataStartRow; row <= sampleEnd; row++) {
		for (const col of layout.tableColumns) worksheet.getCell(row, col).value = null;
	}
	return { sampleEnd, styles, validations, rowHeight: styleRow.height };
};

const writeTestCaseRows = (
	worksheet: ExcelJS.Worksheet,
	layout: ITableLayout,
	sample: ReturnType<typeof takeSampleRows>,
	testCases: Entity.IQaTestCase[]
): void => {
	testCases.forEach((testCase, index) => {
		const rowNumber = layout.dataStartRow + index;
		const row = worksheet.getRow(rowNumber);
		if (rowNumber > sample.sampleEnd) {
			for (let col = 1; col <= layout.lastColumn; col++) row.getCell(col).style = cloneStyle(sample.styles.get(col) ?? {});
			if (sample.rowHeight) row.height = sample.rowHeight;
		}
		for (const { field, col } of layout.columns) row.getCell(col).value = fieldValue(testCase, field);
	});
};

/** Data validation (TYPE, Status, Automation Tools, ...) berlaku di semua baris data; Status + Skip. */
const extendValidations = (
	worksheet: ExcelJS.Worksheet,
	layout: ITableLayout,
	validations: Map<number, ExcelJS.DataValidation>,
	lastDataRow: number
): void => {
	for (const [col, baseValidation] of validations) {
		const validation = col === layout.statusCol ? appendSkipToStatusList(baseValidation) : baseValidation;
		for (let row = layout.dataStartRow; row <= lastDataRow; row++) worksheet.getCell(row, col).dataValidation = { ...validation };
	}
};

/** Rumus di atas tabel (Summary) diperlebar; hasil cache dibuang supaya Excel/Sheets menghitung ulang. */
const widenSummaryFormulas = (worksheet: ExcelJS.Worksheet, layout: ITableLayout, lastDataRow: number): void => {
	for (let row = 1; row < layout.headerRow; row++) {
		worksheet.getRow(row).eachCell((cell) => {
			const value = cell.value;
			if (value && typeof value === 'object' && 'formula' in value && value.formula) {
				cell.value = { formula: widenFormulaRanges(value.formula, layout.dataStartRow, lastDataRow) };
			}
		});
	}
};

/**
 * Isi worksheet template (hasil unduhan tab asli) dengan data project: metadata header, blok PB,
 * baris test case sesuai pemetaan kolom, lalu perlebar rumus Summary dan data validation ke semua baris.
 * Style baris contoh pertama dipakai untuk baris tambahan supaya tampilan identik dengan template.
 */
export const fillTemplateWorksheet = (input: IExportInput): { headerRow: number; dataStartRow: number; lastDataRow: number } => {
	const { worksheet, columnMapping, anchors, project, testCases } = input;
	const layout = resolveTableLayout(worksheet, columnMapping, anchors);
	const sample = takeSampleRows(worksheet, layout);

	writeTestCaseRows(worksheet, layout, sample, testCases);
	const lastDataRow = Math.max(layout.dataStartRow + testCases.length - 1, sample.sampleEnd, layout.dataStartRow);
	extendValidations(worksheet, layout, sample.validations, lastDataRow);
	widenSummaryFormulas(worksheet, layout, lastDataRow);

	fillMetadata(worksheet, anchors.metadata ?? {}, project, testCases);
	if (anchors.pb_block) fillPbBlock(worksheet, anchors.pb_block, project, testCases);

	return { headerRow: layout.headerRow, dataStartRow: layout.dataStartRow, lastDataRow };
};
