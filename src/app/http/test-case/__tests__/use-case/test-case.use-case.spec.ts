import { NotFoundException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import * as projectQueries from '../../../project/queries/project.queries';
import * as tcQueries from '../../queries/test-case.queries';
import * as tcRepo from '../../repo/test-case.repo';
import { listTestCasesUseCase } from '../../use-case/list-test-cases.use-case';
import { createTestCaseUseCase } from '../../use-case/create-test-case.use-case';
import { importTestCasesUseCase } from '../../use-case/import-test-cases.use-case';

jest.mock('../../../project/queries/project.queries');
jest.mock('../../queries/test-case.queries');
jest.mock('../../repo/test-case.repo');

describe('test-case.use-case', () => {
	const mockProject: Entity.IQaProject = { id_project: 1, name: 'Project Test', is_active: 1 };

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('listTestCasesUseCase', () => {
		it('melempar NotFoundException jika project tidak ada', async () => {
			(projectQueries.findProjectById as jest.Mock).mockResolvedValue(null);

			await expect(
				listTestCasesUseCase({ idProject: 999, filter: {} })
			).rejects.toThrow(NotFoundException);
		});

		it('mengembalikan daftar test case beserta summary status', async () => {
			(projectQueries.findProjectById as jest.Mock).mockResolvedValue(mockProject);
			(tcQueries.findTestCasesByProject as jest.Mock).mockResolvedValue([
				{ id_test_case: 1, id_project: 1, test_case_id: 'TC-1', title: 'Login' }
			]);
			(tcQueries.countTestCasesByProject as jest.Mock).mockResolvedValue(1);
			(tcQueries.getTestCaseSummaryByProject as jest.Mock).mockResolvedValue({
				total: 1,
				passed: 0,
				failed: 0,
				re_test: 0,
				progress: 1,
				skip: 0
			});

			const result = await listTestCasesUseCase({ idProject: 1, filter: {} });
			expect(result.items).toHaveLength(1);
			expect(result.items[0].test_case_id).toBe('TC-1');
			expect(result.summary.total).toBe(1);
		});
	});

	describe('createTestCaseUseCase', () => {
		it('membuat test case baru untuk project yang valid', async () => {
			(projectQueries.findProjectById as jest.Mock).mockResolvedValue(mockProject);
			(tcRepo.insertTestCase as jest.Mock).mockResolvedValue(10);
			(tcQueries.findTestCaseById as jest.Mock).mockResolvedValue({
				id_test_case: 10,
				id_project: 1,
				test_case_id: 'TC-10',
				title: 'Checkout Kain'
			});

			const result = await createTestCaseUseCase({
				idProject: 1,
				input: { test_case_id: 'TC-10', title: 'Checkout Kain' },
				userId: 1
			});

			expect(tcRepo.insertTestCase).toHaveBeenCalledWith(
				1,
				{ test_case_id: 'TC-10', title: 'Checkout Kain' },
				1
			);
			expect(result.id_test_case).toBe(10);
		});
	});

	describe('importTestCasesUseCase', () => {
		it('melakukan bulk upsert test cases dan mengembalikan ringkasan', async () => {
			(projectQueries.findProjectById as jest.Mock).mockResolvedValue(mockProject);
			(tcRepo.bulkUpsertTestCases as jest.Mock).mockResolvedValue({
				total: 2,
				inserted: 1,
				updated: 1
			});
			(tcQueries.getTestCaseSummaryByProject as jest.Mock).mockResolvedValue({
				total: 2,
				passed: 1,
				failed: 0,
				re_test: 0,
				progress: 1,
				skip: 0
			});

			const result = await importTestCasesUseCase({
				idProject: 1,
				items: [
					{ test_case_id: 'TC-1', title: 'Login' },
					{ test_case_id: 'TC-2', title: 'Order' }
				]
			});

			expect(result.result.total).toBe(2);
			expect(result.result.inserted).toBe(1);
			expect(result.result.updated).toBe(1);
		});
	});
});
