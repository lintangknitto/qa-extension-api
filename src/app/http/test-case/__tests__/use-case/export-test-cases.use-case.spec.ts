import fs from 'fs';
import path from 'path';
import * as projectQueries from '../../../project/queries/project.queries';
import * as userQueries from '../../../user/queries/user.queries';
import * as templateQueries from '../../../test-case-template/queries/test-case-template.queries';
import * as tcQueries from '../../queries/test-case.queries';
import * as workbookService from '../../services/template-workbook.service';
import { exportTestCasesUseCase } from '../../use-case/export-test-cases.use-case';

jest.mock('../../../project/queries/project.queries');
jest.mock('../../../user/queries/user.queries');
jest.mock('../../../test-case-template/queries/test-case-template.queries');
jest.mock('../../queries/test-case.queries');

const FIXTURE = path.join(__dirname, '../fixtures/format-test-case-v4.xlsx');

const template = {
	id_template: 1,
	version_label: 'V4',
	spreadsheet_url: 'https://docs.google.com/spreadsheets/d/abc/edit',
	column_mapping: { test_case_id: { header: 'Test Case ID' }, title: { header: 'Test Case' }, status: { header: 'Status' } },
	export_anchors: { sheet_name: 'FORMAT TEST CASE V4', header_row: 18, data_start_row: 19 },
	is_default: true,
	is_active: true
};
const project = { id_project: 5, code: 'chat-widget', is_active: true };
let downloaded: Awaited<ReturnType<typeof workbookService.downloadTemplateWorkbook>>['workbook'] | undefined;

describe('exportTestCasesUseCase', () => {
	beforeEach(() => {
		jest.restoreAllMocks();
		jest.clearAllMocks();
		(projectQueries.findProjectById as jest.Mock).mockResolvedValue(project);
		(templateQueries.findDefaultTemplate as jest.Mock).mockResolvedValue(template);
		(tcQueries.findTestCasesByProject as jest.Mock).mockResolvedValue([
			{ test_case_id: 'TC1-1', title: 'Login', status: 'Passed' }
		]);
		(userQueries.getUserAssignedProjectIds as jest.Mock).mockResolvedValue([]);
		jest.spyOn(workbookService, 'downloadTemplateWorkbook').mockImplementation(async (source) => {
			const workbook = await workbookService.loadWorkbook(fs.readFileSync(FIXTURE));
			downloaded = workbook;
			return { workbook, worksheet: workbookService.selectTemplateSheet(workbook, source) };
		});
	});

	it('memakai template default dan menghasilkan xlsx bernama <project-code>-test-case-v4.xlsx', async () => {
		const file = await exportTestCasesUseCase({ idProject: 5, userId: 1, userLevel: 'QA' });
		expect(file.filename).toBe('chat-widget-test-case-v4.xlsx');
		expect(file.contentType).toContain('spreadsheetml');
		const workbook = await workbookService.loadWorkbook(file.buffer);
		expect(workbook.worksheets[0].getCell('E19').value).toBe('TC1-1');
		// exceljs menulis fullCalcOnLoad tapi tidak membacanya ulang; cek di workbook yang diekspor.
		expect(downloaded?.calcProperties.fullCalcOnLoad).toBe(true);
		expect(tcQueries.findTestCasesByProject).toHaveBeenCalledWith(5);
	});

	it('memakai template pilihan (?template) dan menolak template nonaktif / tidak ada', async () => {
		(templateQueries.findTemplateById as jest.Mock).mockResolvedValueOnce({ ...template, id_template: 2, version_label: 'V5', is_default: false });
		await expect(exportTestCasesUseCase({ idProject: 5, idTemplate: 2, userLevel: 'ADMIN' })).resolves.toMatchObject({
			filename: 'chat-widget-test-case-v5.xlsx'
		});

		(templateQueries.findTemplateById as jest.Mock).mockResolvedValueOnce({ ...template, is_active: false });
		await expect(exportTestCasesUseCase({ idProject: 5, idTemplate: 2, userLevel: 'ADMIN' })).rejects.toThrow('nonaktif');

		(templateQueries.findTemplateById as jest.Mock).mockResolvedValueOnce(null);
		await expect(exportTestCasesUseCase({ idProject: 5, idTemplate: 9, userLevel: 'ADMIN' })).rejects.toThrow('tidak ditemukan');
	});

	it('cek akses project: 404, project nonaktif, dan project di luar assignment', async () => {
		(projectQueries.findProjectById as jest.Mock).mockResolvedValueOnce(null);
		await expect(exportTestCasesUseCase({ idProject: 99, userId: 1, userLevel: 'QA' })).rejects.toThrow('Project tidak ditemukan');

		(projectQueries.findProjectById as jest.Mock).mockResolvedValueOnce({ ...project, is_active: false });
		await expect(exportTestCasesUseCase({ idProject: 5, userId: 1, userLevel: 'VIEWER' })).rejects.toThrow('nonaktif');

		(userQueries.getUserAssignedProjectIds as jest.Mock).mockResolvedValueOnce([7, 8]);
		await expect(exportTestCasesUseCase({ idProject: 5, userId: 1, userLevel: 'QA' })).rejects.toThrow('tidak memiliki akses');
		expect(workbookService.downloadTemplateWorkbook).not.toHaveBeenCalled();

		(userQueries.getUserAssignedProjectIds as jest.Mock).mockResolvedValueOnce([5]);
		await expect(exportTestCasesUseCase({ idProject: 5, userId: 1, userLevel: 'QA' })).resolves.toBeDefined();
	});

	it('404 jelas bila belum ada template default', async () => {
		(templateQueries.findDefaultTemplate as jest.Mock).mockResolvedValueOnce(null);
		await expect(exportTestCasesUseCase({ idProject: 5, userLevel: 'ADMIN' })).rejects.toThrow('Belum ada template test case default');
	});
});
