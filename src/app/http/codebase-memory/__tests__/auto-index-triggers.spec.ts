jest.mock('@/app/http/codebase-memory/services/auto-index.service');
jest.mock('@/app/http/program/queries/program.queries');
jest.mock('@/app/http/program/repo/program.repo');
jest.mock('@/app/http/project/queries/project.queries');
jest.mock('@/app/http/project/repo/project.repo');

import { triggerProgramRepoIndex, triggerProjectRepoIndex } from '@/app/http/codebase-memory/services/auto-index.service';
import * as programQueries from '@/app/http/program/queries/program.queries';
import * as programRepo from '@/app/http/program/repo/program.repo';
import * as projectQueries from '@/app/http/project/queries/project.queries';
import { createProgramUseCase } from '@/app/http/program/use-case/create-program.use-case';
import { updateProgramUseCase } from '@/app/http/program/use-case/update-program.use-case';
import { updateProjectUseCase } from '@/app/http/project/use-case/update-project.use-case';

const program = (extra: Record<string, unknown> = {}) => ({
	id_program: 1,
	name: 'Widget',
	code: 'widget',
	repo_url: 'https://github.com/knittotextile/knitto-widget-chat',
	repo_branch: null,
	is_active: true,
	created_by_user_id: 10,
	...extra
});

beforeEach(() => jest.clearAllMocks());

describe('pemicu auto-index', () => {
	it('buat program dengan repo → trigger index; repo_branch kosong disimpan null', async () => {
		(programQueries.findProgramByCode as jest.Mock).mockResolvedValue(null);
		(programRepo.insertProgram as jest.Mock).mockResolvedValue(1);
		(programQueries.findProgramById as jest.Mock).mockResolvedValue(program());
		const res = await createProgramUseCase({
			userId: 10,
			userLevel: 'ADMIN',
			input: { name: 'Widget', repo_url: 'https://github.com/knittotextile/knitto-widget-chat', repo_branch: '  ' }
		});
		expect(programRepo.insertProgram).toHaveBeenCalledWith(expect.objectContaining({ repoBranch: null }));
		expect(triggerProgramRepoIndex).toHaveBeenCalledWith(expect.objectContaining({ repo_url: program().repo_url }));
		expect(res.repo_branch).toBeNull();
	});

	it('repo_url di luar allowlist owner (4.7) ditolak saat buat/ubah program & project, tanpa trigger', async () => {
		const input = { name: 'Asing', repo_url: 'https://github.com/other/secret' };
		await expect(createProgramUseCase({ userId: 10, userLevel: 'ADMIN', input })).rejects.toThrow('tidak diizinkan');
		await expect(updateProgramUseCase({ userId: 10, userLevel: 'ADMIN', idProgram: 1, input })).rejects.toThrow('tidak diizinkan');
		await expect(updateProjectUseCase({ userId: 10, userLevel: 'ADMIN', idProject: 1, input })).rejects.toThrow('tidak diizinkan');
		expect(programRepo.insertProgram).not.toHaveBeenCalled();
		expect(triggerProgramRepoIndex).not.toHaveBeenCalled();
		expect(triggerProjectRepoIndex).not.toHaveBeenCalled();
	});

	it('ubah program: branch berubah → trigger; field lain saja → tidak', async () => {
		(programQueries.findProgramById as jest.Mock).mockResolvedValueOnce(program()).mockResolvedValueOnce(program({ repo_branch: 'develop' }));
		await updateProgramUseCase({ userId: 10, userLevel: 'ADMIN', idProgram: 1, input: { repo_branch: 'develop' } });
		expect(programRepo.updateProgram).toHaveBeenCalledWith(1, expect.objectContaining({ repoBranch: 'develop' }));
		expect(triggerProgramRepoIndex).toHaveBeenCalledTimes(1);

		(programQueries.findProgramById as jest.Mock).mockResolvedValueOnce(program()).mockResolvedValueOnce(program({ description: 'baru' }));
		await updateProgramUseCase({ userId: 10, userLevel: 'ADMIN', idProgram: 1, input: { description: 'baru' } });
		expect(triggerProgramRepoIndex).toHaveBeenCalledTimes(1);
	});

	it('ubah project: tautan program ber-repo berubah → trigger; tidak berubah → tidak', async () => {
		const before = { id_project: 1, name: 'P', code: 'p', is_active: 1, created_by_user_id: 10, programs: [] };
		const after = { ...before, programs: [{ id_program: 1, name: 'Widget', code: 'widget', repo_url: 'https://github.com/knittotextile/knitto-widget-chat' }] };
		(projectQueries.findProjectById as jest.Mock).mockResolvedValueOnce(before).mockResolvedValueOnce(after);
		await updateProjectUseCase({ userId: 10, userLevel: 'ADMIN', idProject: 1, input: { program_ids: [1] } as never });
		expect(triggerProjectRepoIndex).toHaveBeenCalledWith(after);

		(projectQueries.findProjectById as jest.Mock).mockResolvedValueOnce(after).mockResolvedValueOnce({ ...after, name: 'P2' });
		await updateProjectUseCase({ userId: 10, userLevel: 'ADMIN', idProject: 1, input: { name: 'P2' } as never });
		expect(triggerProjectRepoIndex).toHaveBeenCalledTimes(1);
	});
});
