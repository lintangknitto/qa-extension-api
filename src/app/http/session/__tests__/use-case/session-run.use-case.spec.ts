import {
	InvalidParameterException,
	NotAuthorizationException,
	NotFoundException
} from '@knittotextile/knitto-core-backend/dist/CoreException';
import {
	createRunUseCase,
	listRunsUseCase,
	presignRunVideoUseCase,
	completeRunVideoUseCase
} from '../../use-case/session-run.use-case';
import * as queries from '../../queries/session.queries';
import * as repo from '../../repo/session.repo';
import * as runRepo from '../../repo/session-run.repo';
import * as tcRepo from '../../../test-case/repo/test-case.repo';
import * as minioClient from '@/libs/config/minioClient';

jest.mock('../../queries/session.queries');
jest.mock('../../repo/session.repo');
jest.mock('../../repo/session-run.repo');
jest.mock('../../../test-case/repo/test-case.repo');
jest.mock('@/libs/config/minioClient');

const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('session run use cases', () => {
	const session: Entity.IQaRecordingSession = {
		id_session: 1,
		id_test_case: 9,
		test_case_no: 'TC-1',
		title: 'Login',
		owner_user_id: 5,
		status: 'completed',
		video_object_key: `sessions/1/video/${UUID}.webm`
	};
	const run2: Entity.IQaRecordingSessionRun = {
		id_run: 22,
		id_session: 1,
		run_number: 2,
		kind: 'rerun',
		result: 'PASS',
		started_at: '2026-10-09T03:05:00Z'
	};
	const access = { idSession: 1, userId: 5, userLevel: 'QA' };

	beforeEach(() => {
		jest.clearAllMocks();
		(queries.findSessionById as jest.Mock).mockResolvedValue(session);
		(minioClient.buildPublicObjectUrl as jest.Mock).mockImplementation((key: string) => `http://minio/b/${key}`);
	});

	describe('createRunUseCase', () => {
		it('menyimpan re-run, memperbarui hasil sesi dan status test case', async () => {
			(runRepo.findRunByNumber as jest.Mock).mockResolvedValue({ id_run: 1, run_number: 1 });
			(runRepo.insertRerun as jest.Mock).mockResolvedValue(run2);

			const result = await createRunUseCase({
				...access,
				input: { result: 'BLOCKED', actual_result: 'macet', executed_steps: 3, started_at: '2026-10-09T03:05:00Z' }
			});

			expect(runRepo.upsertOriginalRun).not.toHaveBeenCalled();
			expect(runRepo.insertRerun).toHaveBeenCalledWith(expect.objectContaining({
				idSession: 1, result: 'BLOCKED', actualResult: 'macet', executedSteps: 3, createdByUserId: 5
			}));
			expect(repo.updateSessionResult).toHaveBeenCalledWith(1, 'BLOCKED', 'macet');
			expect(tcRepo.updateTestCaseStatusAndEvidence).toHaveBeenCalledWith(9, 'Re-Test', 'macet', 1);
			expect(result.run_number).toBe(2);
			expect(result.video_file_name).toBe('TC-1 - Login - 2026-10-09 10.05 - Run 2.webm');
		});

		it('membuat Run #1 dulu untuk sesi lama yang belum punya run', async () => {
			(runRepo.findRunByNumber as jest.Mock).mockResolvedValue(null);
			(runRepo.insertRerun as jest.Mock).mockResolvedValue(run2);

			await createRunUseCase({ ...access, input: { result: 'PASS' } });

			expect(runRepo.upsertOriginalRun).toHaveBeenCalledWith(1, 5);
		});

		it('menolak sesi yang masih merekam', async () => {
			(queries.findSessionById as jest.Mock).mockResolvedValue({ ...session, status: 'recording' });
			await expect(createRunUseCase({ ...access, input: { result: 'PASS' } })).rejects.toThrow(InvalidParameterException);
			expect(runRepo.insertRerun).not.toHaveBeenCalled();
		});

		it('menolak user tanpa akses', async () => {
			await expect(createRunUseCase({ ...access, userId: 99, userLevel: 'VIEWER', input: { result: 'PASS' } }))
				.rejects.toThrow(NotAuthorizationException);
		});
	});

	it('listRunsUseCase memetakan run dengan video_url dan nama file', async () => {
		(runRepo.listRunsBySession as jest.Mock).mockResolvedValue([
			{ ...run2, run_number: 1, kind: 'original', video_object_key: session.video_object_key }
		]);
		const [run] = await listRunsUseCase(access);
		expect(run.video_url).toBe(`http://minio/b/${session.video_object_key}`);
		expect(run.video_file_name).toBe('TC-1 - Login - 2026-10-09 10.05 - Run 1.webm');
	});

	describe('video run', () => {
		it('presign membuat key bernama per run', async () => {
			(runRepo.findRunByNumber as jest.Mock).mockResolvedValue(run2);
			const result = await presignRunVideoUseCase({ ...access, runNumber: 2, input: { size_bytes: 1000 } });
			expect(result.object_key).toMatch(/^sessions\/1\/video\/[0-9a-f-]{36}\/TC-1 - Login - 2026-10-09 10\.05 - Run 2\.webm$/);
		});

		it('presign menolak run yang tidak ada dan video > 100MB', async () => {
			(runRepo.findRunByNumber as jest.Mock).mockResolvedValueOnce(null);
			await expect(presignRunVideoUseCase({ ...access, runNumber: 5, input: { size_bytes: 1 } })).rejects.toThrow(NotFoundException);
			(runRepo.findRunByNumber as jest.Mock).mockResolvedValueOnce(run2);
			await expect(presignRunVideoUseCase({ ...access, runNumber: 2, input: { size_bytes: 101 * 1024 * 1024 } }))
				.rejects.toThrow(InvalidParameterException);
		});

		it('complete menyimpan key ke run tanpa menyentuh video sesi', async () => {
			const key = `sessions/1/video/${UUID}/TC-1 - Login - 2026-10-09 10.05 - Run 2.webm`;
			(runRepo.findRunByNumber as jest.Mock).mockResolvedValue(run2);
			(minioClient.statArtifactObject as jest.Mock).mockResolvedValue({ size: 1000 });

			const result = await completeRunVideoUseCase({ ...access, runNumber: 2, input: { object_key: key } });

			expect(runRepo.updateRunVideoObjectKey).toHaveBeenCalledWith(22, key);
			expect(repo.updateSessionVideoObjectKey).not.toHaveBeenCalled();
			expect(result.video_url).toBe(`http://minio/b/${key}`);
		});

		it('complete menolak key video sesi, key sesi lain, objek hilang, dan objek > 100MB', async () => {
			(runRepo.findRunByNumber as jest.Mock).mockResolvedValue(run2);
			const complete = (objectKey: string) =>
				completeRunVideoUseCase({ ...access, runNumber: 2, input: { object_key: objectKey } });

			await expect(complete(session.video_object_key as string)).rejects.toThrow(InvalidParameterException);
			await expect(complete(`sessions/2/video/${UUID}/a.webm`)).rejects.toThrow(InvalidParameterException);
			(minioClient.statArtifactObject as jest.Mock).mockRejectedValueOnce(new Error('NotFound'));
			await expect(complete(`sessions/1/video/${UUID}/a.webm`)).rejects.toThrow(InvalidParameterException);
			(minioClient.statArtifactObject as jest.Mock).mockResolvedValueOnce({ size: 101 * 1024 * 1024 });
			await expect(complete(`sessions/1/video/${UUID}/a.webm`)).rejects.toThrow(InvalidParameterException);
			expect(runRepo.updateRunVideoObjectKey).not.toHaveBeenCalled();
		});
	});
});
