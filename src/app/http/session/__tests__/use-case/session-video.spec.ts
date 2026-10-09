import {
	InvalidParameterException,
	NotFoundException,
	NotAuthorizationException
} from '@knittotextile/knitto-core-backend/dist/CoreException';
import {
	presignSessionVideoUseCase,
	completeSessionVideoUseCase,
	getSessionVideoUrlUseCase,
	isValidVideoObjectKey
} from '../../use-case/session-video.use-case';
import * as sessionQueries from '../../queries/session.queries';
import * as sessionRepo from '../../repo/session.repo';
import * as runRepo from '../../repo/session-run.repo';
import * as minioClient from '@/libs/config/minioClient';
import { buildVideoFileName } from '@/libs/helpers/videoFileName';

jest.mock('../../queries/session.queries');
jest.mock('../../repo/session.repo');
jest.mock('../../repo/session-run.repo');
jest.mock('@/libs/config/minioClient');

describe('Session Video Use Cases (MinIO)', () => {
	const mockSession: Entity.IQaRecordingSession = {
		id_session: 1,
		id_project: 10,
		test_case_no: 'TC-AUTH-01',
		title: 'Login User Valid',
		owner_user_id: 5,
		status: 'recording',
		video_url: null
	};

	const VALID_KEY = 'sessions/1/video/0f8fad5b-d9cb-469f-a165-70867728950e.webm';

	beforeEach(() => {
		jest.clearAllMocks();
		(minioClient.buildPublicObjectUrl as jest.Mock).mockImplementation((key: string) => `http://minio.pub/bucket/${key}`);
	});

	describe('presignSessionVideoUseCase', () => {
		it('menolak video dengan ukuran melebihi batas 100MB', async () => {
			(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(mockSession);

			await expect(
				presignSessionVideoUseCase({
					idSession: 1,
					userId: 5,
					userLevel: 'QA',
					input: { size_bytes: 120 * 1024 * 1024 }
				})
			).rejects.toThrow(InvalidParameterException);
		});

		it('menghasilkan URL upload publik tanpa signature dan object key UUID', async () => {
			(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(mockSession);

			const result = await presignSessionVideoUseCase({
				idSession: 1,
				userId: 5,
				userLevel: 'QA',
				input: { size_bytes: 5 * 1024 * 1024, content_type: 'video/webm' }
			});

			expect(result.object_key).toMatch(/^sessions\/1\/video\/[0-9a-f-]{36}\/TC-AUTH-01 - Login User Valid - .+ - Run 1\.webm$/);
			expect(result.upload_url).toBe(`http://minio.pub/bucket/${result.object_key}`);
			expect(result.content_type).toBe('video/webm');
		});

		it('melempar NotFoundException jika idSession tidak ditemukan', async () => {
			(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(null);

			await expect(
				presignSessionVideoUseCase({
					idSession: 999,
					userId: 5,
					userLevel: 'QA',
					input: { size_bytes: 1024 }
				})
			).rejects.toThrow(NotFoundException);
		});

		it('melempar NotAuthorizationException jika user bukan owner dan bukan QA/admin', async () => {
			(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(mockSession);

			await expect(
				presignSessionVideoUseCase({
					idSession: 1,
					userId: 999,
					userLevel: 'GUEST',
					input: { size_bytes: 1024 }
				})
			).rejects.toThrow(NotAuthorizationException);
		});
	});

	describe('completeSessionVideoUseCase', () => {
		it('melempar InvalidParameterException jika object_key bukan milik sesi ini', async () => {
			(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(mockSession);

			await expect(
				completeSessionVideoUseCase({
					idSession: 1,
					userId: 5,
					userLevel: 'QA',
					input: { object_key: 'sessions/99/video/0f8fad5b-d9cb-469f-a165-70867728950e.webm' }
				})
			).rejects.toThrow('Object key tidak valid untuk sesi ini.');
		});

		it('menolak format key lama (session+timestamp) dan path traversal', async () => {
			(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(mockSession);
			for (const object_key of ['sessions/10/1-video-123.webm', 'sessions/1/video/../../x.webm', 'sessions/1/video/abc.webm', 'sessions/1/video/------------------------------------.webm']) {
				await expect(
					completeSessionVideoUseCase({ idSession: 1, userId: 5, userLevel: 'QA', input: { object_key } })
				).rejects.toThrow('Object key tidak valid untuk sesi ini.');
			}
			expect(minioClient.statArtifactObject).not.toHaveBeenCalled();
		});

		it('melempar error jika objek video belum ada di storage MinIO', async () => {
			(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(mockSession);
			(minioClient.statArtifactObject as jest.Mock).mockRejectedValue(new Error('Object not found'));

			await expect(
				completeSessionVideoUseCase({
					idSession: 1,
					userId: 5,
					userLevel: 'QA',
					input: { object_key: VALID_KEY }
				})
			).rejects.toThrow(InvalidParameterException);
		});

		it('menolak video terunggah yang melebihi 100MB dan tidak menyimpan key', async () => {
			(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(mockSession);
			(minioClient.statArtifactObject as jest.Mock).mockResolvedValue({ size: 100 * 1024 * 1024 + 1 });

			await expect(
				completeSessionVideoUseCase({ idSession: 1, userId: 5, userLevel: 'QA', input: { object_key: VALID_KEY } })
			).rejects.toThrow('Ukuran video melebihi batas 100MB.');
			expect(sessionRepo.updateSessionVideoObjectKey).not.toHaveBeenCalled();
		});

		it('memverifikasi objek di MinIO, menyimpan object key, dan mengembalikan URL publik', async () => {
			(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(mockSession);
			(minioClient.statArtifactObject as jest.Mock).mockResolvedValue({ size: 5000000 });
			(sessionRepo.updateSessionVideoObjectKey as jest.Mock).mockResolvedValue(undefined);

			const result = await completeSessionVideoUseCase({
				idSession: 1,
				userId: 5,
				userLevel: 'QA',
				input: { object_key: VALID_KEY }
			});

			expect(minioClient.statArtifactObject).toHaveBeenCalledWith(VALID_KEY);
			expect(result.video_url).toBe(`http://minio.pub/bucket/${VALID_KEY}`);
			expect(sessionRepo.updateSessionVideoObjectKey).toHaveBeenCalledWith(1, VALID_KEY);
			expect(runRepo.updateOriginalRunVideoObjectKey).toHaveBeenCalledWith(1, VALID_KEY);
		});
	});

	describe('getSessionVideoUrlUseCase', () => {
		it('menghitung video_url publik dari video_object_key (mengabaikan video_url presigned lama)', async () => {
			(sessionQueries.findSessionById as jest.Mock).mockResolvedValue({
				...mockSession,
				video_url: 'http://127.0.0.1:9000/x?X-Amz-Signature=expired',
				video_object_key: 'sessions/10/1-video-123.webm'
			});

			const result = await getSessionVideoUrlUseCase({
				idSession: 1,
				userId: 5,
				userLevel: 'QA'
			});

			expect(result.video_url).toBe('http://minio.pub/bucket/sessions/10/1-video-123.webm');
		});

		it('mengembalikan null jika sesi belum memiliki video_object_key', async () => {
			(sessionQueries.findSessionById as jest.Mock).mockResolvedValue({
				...mockSession,
				video_url: null
			});

			const result = await getSessionVideoUrlUseCase({
				idSession: 1,
				userId: 5,
				userLevel: 'QA'
			});

			expect(result.video_url).toBeNull();
		});

		it('melempar NotFoundException jika idSession tidak ditemukan', async () => {
			(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(null);

			await expect(
				getSessionVideoUrlUseCase({
					idSession: 999,
					userId: 5,
					userLevel: 'QA'
				})
			).rejects.toThrow(NotFoundException);
		});
	});

	describe('isValidVideoObjectKey', () => {
		const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e';
		it.each([
			[`sessions/1/video/${uuid}.webm`, true],
			[`sessions/1/video/${uuid}/TC-1 - Login - 2026-10-09 10.05 - Run 1.webm`, true],
			[`sessions/2/video/${uuid}/a.webm`, false],
			[`sessions/1/video/${uuid}/../x.webm`, false],
			[`sessions/1/video/${uuid}/a/b.webm`, false],
			[`sessions/1/video/${uuid}/..webm`, false],
			[`sessions/1/video/${uuid}/a:b.webm`, false],
			[`sessions/1/video/${uuid}/a.mp4`, false],
			[`sessions/1/video/not-a-uuid/a.webm`, false],
			[null, false]
		])('%s → %s', (key, expected) => {
			expect(isValidVideoObjectKey(1, key)).toBe(expected);
		});

		it('nama dari buildVideoFileName untuk TC sangat panjang dan judul emoji tetap valid', () => {
			for (const input of [
				{ testCaseNo: 'TC ' + 'a'.repeat(200) + ' x', title: 'Judul' },
				{ testCaseNo: 'TC-1', title: '\u{1F600}'.repeat(200) },
				{ testCaseNo: 'TC-2', title: 'a\uD83Db' }
			]) {
				const name = buildVideoFileName({ ...input, startedAt: '2026-10-09T00:00:00Z', runNumber: 1 });
				expect(isValidVideoObjectKey(1, `sessions/1/video/${uuid}/${name}`)).toBe(true);
			}
		});
	});
});
