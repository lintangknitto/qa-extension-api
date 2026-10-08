import * as queries from '../../queries/program.queries';
import * as repo from '../../repo/program.repo';
import { createProgramUseCase } from '../../use-case/create-program.use-case';
import { updateProgramUseCase } from '../../use-case/update-program.use-case';
import { deleteProgramUseCase } from '../../use-case/delete-program.use-case';
import { listProgramsUseCase, listActiveProgramsUseCase } from '../../use-case/list-programs.use-case';

jest.mock('../../queries/program.queries');
jest.mock('../../repo/program.repo');

describe('program use cases', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('createProgramUseCase', () => {
		it('berhasil membuat program baru dengan kode otomatis atau custom', () => {
			(queries.findProgramByCode as jest.Mock).mockResolvedValue(null);
			(repo.insertProgram as jest.Mock).mockResolvedValue(1);
			(queries.findProgramById as jest.Mock).mockResolvedValue({
				id_program: 1,
				name: 'Knitto Portal',
				code: 'knitto-portal',
				base_url: 'https://staging.portal.knitto.id',
				repo_url: 'https://github.com/knittotextile/knitto-portal',
				is_active: true,
				created_by_user_id: 10
			});

			return createProgramUseCase({
				userId: 10,
				userLevel: 'ADMIN',
				input: {
					name: 'Knitto Portal',
					base_url: 'https://staging.portal.knitto.id',
					repo_url: 'https://github.com/knittotextile/knitto-portal'
				}
			}).then((res) => {
				expect(res.id_program).toBe(1);
				expect(res.code).toBe('knitto-portal');
				expect(repo.insertProgram).toHaveBeenCalledWith(
					expect.objectContaining({
						name: 'Knitto Portal',
						code: 'knitto-portal',
						baseUrl: 'https://staging.portal.knitto.id',
						repoUrl: 'https://github.com/knittotextile/knitto-portal',
						createdByUserId: 10
					})
				);
			});
		});

		it('menolak pembuatan jika kode program sudah dipakai', async () => {
			(queries.findProgramByCode as jest.Mock).mockResolvedValue({
				id_program: 99,
				code: 'knitto-portal'
			});

			await expect(
				createProgramUseCase({
					userId: 10,
					userLevel: 'ADMIN',
					input: { name: 'Knitto Portal' }
				})
			).rejects.toThrow('Kode program sudah dipakai.');
		});
	});

	describe('updateProgramUseCase', () => {
		it('memperbarui data program oleh creator atau admin', async () => {
			(queries.findProgramById as jest.Mock)
				.mockResolvedValueOnce({
					id_program: 1,
					name: 'Knitto Portal',
					code: 'knitto-portal',
					created_by_user_id: 10
				})
				.mockResolvedValueOnce({
					id_program: 1,
					name: 'Knitto Portal V2',
					code: 'knitto-portal',
					created_by_user_id: 10
				});

			const res = await updateProgramUseCase({
				userId: 10,
				userLevel: 'QA',
				idProgram: 1,
				input: { name: 'Knitto Portal V2' }
			});

			expect(res.name).toBe('Knitto Portal V2');
			expect(repo.updateProgram).toHaveBeenCalledWith(
				1,
				expect.objectContaining({ name: 'Knitto Portal V2' })
			);
		});
	});

	describe('deleteProgramUseCase', () => {
		it('menghapus permanen jika tidak ada project terkait', async () => {
			(queries.findProgramById as jest.Mock).mockResolvedValue({
				id_program: 1,
				name: 'Knitto Portal',
				created_by_user_id: 10
			});
			(queries.countProgramAssociatedProjects as jest.Mock).mockResolvedValue(0);

			const res = await deleteProgramUseCase({
				userId: 10,
				userLevel: 'ADMIN',
				idProgram: 1
			});

			expect(res.action).toBe('deleted');
			expect(repo.deleteProgramPermanently).toHaveBeenCalledWith(1);
		});

		it('menonaktifkan (deactivate) jika masih ada project terkait', async () => {
			(queries.findProgramById as jest.Mock).mockResolvedValue({
				id_program: 1,
				name: 'Knitto Portal',
				created_by_user_id: 10
			});
			(queries.countProgramAssociatedProjects as jest.Mock).mockResolvedValue(3);

			const res = await deleteProgramUseCase({
				userId: 10,
				userLevel: 'ADMIN',
				idProgram: 1
			});

			expect(res.action).toBe('deactivated');
			expect(repo.setProgramActive).toHaveBeenCalledWith(1, false);
		});
	});

	describe('listProgramsUseCase & listActiveProgramsUseCase', () => {
		it('mengembalikan daftar program dengan pagination', async () => {
			(queries.listPrograms as jest.Mock).mockResolvedValue([
				{ id_program: 1, name: 'Portal', code: 'portal', is_active: true }
			]);
			(queries.countPrograms as jest.Mock).mockResolvedValue(1);

			const res = await listProgramsUseCase({
				userId: 10,
				userLevel: 'QA',
				input: { page: 0, perPage: 20 }
			});

			expect(res.total).toBe(1);
			expect(res.items).toHaveLength(1);
		});

		it('mengembalikan daftar program aktif untuk dropdown', async () => {
			(queries.listActivePrograms as jest.Mock).mockResolvedValue([
				{ id_program: 1, name: 'Portal', code: 'portal', is_active: true }
			]);
			(queries.countActivePrograms as jest.Mock).mockResolvedValue(1);

			const res = await listActiveProgramsUseCase({
				userId: 10,
				userLevel: 'QA',
				input: { search: 'Portal' }
			});

			expect(res.total).toBe(1);
			expect(res.items).toHaveLength(1);
		});
	});
});
