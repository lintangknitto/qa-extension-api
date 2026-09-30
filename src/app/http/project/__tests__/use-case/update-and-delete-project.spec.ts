import { updateProjectUseCase } from '../../use-case/update-project.use-case';
import { deactivateProjectUseCase } from '../../use-case/deactivate-project.use-case';
import * as queries from '../../queries/project.queries';
import * as repo from '../../repo/project.repo';
import { NotAuthorizationException } from '@knittotextile/knitto-core-backend/dist/CoreException';

jest.mock('../../queries/project.queries');
jest.mock('../../repo/project.repo');

const mockedQueries = queries as jest.Mocked<typeof queries>;
const mockedRepo = repo as jest.Mocked<typeof repo>;

describe('Project Use Cases — Update & Delete', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('updateProjectUseCase', () => {
		it('mengizinkan Admin mengupdate project siapapun', async () => {
			mockedQueries.findProjectById.mockResolvedValue({
				id_project: 1,
				name: 'Old Name',
				code: 'old-name',
				created_by_user_id: 10,
				is_active: 1
			});
			mockedRepo.updateProject.mockResolvedValue();

			const result = await updateProjectUseCase({
				userId: 99,
				userLevel: 'ADMIN',
				idProject: 1,
				input: {
					name: 'Updated Name',
					base_url: 'https://newurl.com',
					description: 'New Desc',
					is_active: true
				}
			});

			expect(mockedRepo.updateProject).toHaveBeenCalledWith(1, expect.objectContaining({
				name: 'Updated Name',
				baseUrl: 'https://newurl.com'
			}));
			expect(result.name).toBe('Old Name'); // from mock return
		});

		it('mengizinkan QA jika creator project', async () => {
			mockedQueries.findProjectById.mockResolvedValue({
				id_project: 2,
				name: 'QA Project',
				code: 'qa-project',
				created_by_user_id: 5,
				is_active: 1
			});
			mockedRepo.updateProject.mockResolvedValue();

			await updateProjectUseCase({
				userId: 5,
				userLevel: 'QA',
				idProject: 2,
				input: { name: 'New QA Project Name' }
			});

			expect(mockedRepo.updateProject).toHaveBeenCalled();
		});

		it('menolak QA jika bukan creator', async () => {
			mockedQueries.findProjectById.mockResolvedValue({
				id_project: 2,
				name: 'Other Project',
				code: 'other-project',
				created_by_user_id: 10,
				is_active: 1
			});

			await expect(
				updateProjectUseCase({
					userId: 5,
					userLevel: 'QA',
					idProject: 2,
					input: { name: 'Attempt Hack' }
				})
			).rejects.toThrow(NotAuthorizationException);
		});
	});

	describe('deactivateProjectUseCase (Protective Hybrid Delete)', () => {
		it('melakukan soft deactivation jika project memiliki test case/session', async () => {
			mockedQueries.findProjectById.mockResolvedValue({
				id_project: 1,
				name: 'Active Project With Data',
				code: 'active-data',
				created_by_user_id: 1,
				is_active: 1
			});
			mockedQueries.countProjectAssociatedData.mockResolvedValue(5);
			mockedRepo.setProjectActive.mockResolvedValue();

			const result = await deactivateProjectUseCase({
				userId: 1,
				userLevel: 'SUPERADMIN',
				idProject: 1
			});

			expect(mockedRepo.setProjectActive).toHaveBeenCalledWith(1, false);
			expect(mockedRepo.deleteProjectPermanently).not.toHaveBeenCalled();
			expect(result.deactivated).toBe(true);
			expect(result.deleted).toBe(false);
		});

		it('melakukan hard delete jika project steril tanpa data', async () => {
			mockedQueries.findProjectById.mockResolvedValue({
				id_project: 2,
				name: 'Empty Project',
				code: 'empty-project',
				created_by_user_id: 3,
				is_active: 1
			});
			mockedQueries.countProjectAssociatedData.mockResolvedValue(0);
			mockedRepo.deleteProjectPermanently.mockResolvedValue();

			const result = await deactivateProjectUseCase({
				userId: 3,
				userLevel: 'QA',
				idProject: 2
			});

			expect(mockedRepo.deleteProjectPermanently).toHaveBeenCalledWith(2);
			expect(mockedRepo.setProjectActive).not.toHaveBeenCalled();
			expect(result.deleted).toBe(true);
			expect(result.deactivated).toBe(false);
		});
	});
});
