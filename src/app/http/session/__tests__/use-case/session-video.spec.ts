import {
	InvalidParameterException,
	NotFoundException,
	NotAuthorizationException
} from '@knittotextile/knitto-core-backend/dist/CoreException';
import {
	presignSessionVideoUseCase,
	completeSessionVideoUseCase,
	getSessionVideoUrlUseCase
} from '../../use-case/session-video.use-case';
import * as sessionQueries from '../../queries/session.queries';
import * as sessionRepo from '../../repo/session.repo';
import * as minioClient from '@/libs/config/minioClient';

jest.mock('../../queries/session.queries');
jest.mock('../../repo/session.repo');
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

	beforeEach(() => {
		jest.clearAllMocks();
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

		it('menghasilkan presigned PUT URL dan object key yang valid', async () => {
			(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(mockSession);
			(minioClient.createPresignedPutUrl as jest.Mock).mockResolvedValue('http://minio:9000/upload-put-url');

			const result = await presignSessionVideoUseCase({
				idSession: 1,
				userId: 5,
				userLevel: 'QA',
				input: { size_bytes: 5 * 1024 * 1024, content_type: 'video/webm' }
			});

			expect(result.upload_url).toBe('http://minio:9000/upload-put-url');
			expect(result.object_key).toMatch(/^sessions\/10\/1-video-\d+\.webm$/);
			expect(result.content_type).toBe('video/webm');
			expect(minioClient.createPresignedPutUrl).toHaveBeenCalledWith(result.object_key, 3600);
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
					input: { object_key: 'sessions/99/99-video-123.webm' }
				})
			).rejects.toThrow('Object key tidak valid untuk sesi ini.');
		});

		it('melempar error jika objek video belum ada di storage MinIO', async () => {
			(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(mockSession);
			(minioClient.statArtifactObject as jest.Mock).mockRejectedValue(new Error('Object not found'));

			await expect(
				completeSessionVideoUseCase({
					idSession: 1,
					userId: 5,
					userLevel: 'QA',
					input: { object_key: 'sessions/10/1-video-123.webm' }
				})
			).rejects.toThrow(InvalidParameterException);
		});

		it('memverifikasi objek di MinIO, men-generate streaming URL, dan menyimpan ke database', async () => {
			(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(mockSession);
			(minioClient.statArtifactObject as jest.Mock).mockResolvedValue({ size: 5000000 });
			(minioClient.createPresignedGetUrl as jest.Mock).mockResolvedValue('http://minio:9000/stream-video.webm');
			(sessionRepo.updateSessionVideoUrl as jest.Mock).mockResolvedValue(undefined);

			const result = await completeSessionVideoUseCase({
				idSession: 1,
				userId: 5,
				userLevel: 'QA',
				input: { object_key: 'sessions/10/1-video-123.webm' }
			});

			expect(result.video_url).toBe('http://minio:9000/stream-video.webm');
			expect(sessionRepo.updateSessionVideoUrl).toHaveBeenCalledWith(1, 'http://minio:9000/stream-video.webm');
		});
	});

	describe('getSessionVideoUrlUseCase', () => {
		it('mengembalikan video_url yang tersimpan di sesi', async () => {
			(sessionQueries.findSessionById as jest.Mock).mockResolvedValue({
				...mockSession,
				video_url: 'http://minio:9000/stream-video.webm'
			});

			const result = await getSessionVideoUrlUseCase({
				idSession: 1,
				userId: 5,
				userLevel: 'QA'
			});

			expect(result.video_url).toBe('http://minio:9000/stream-video.webm');
		});

		it('mengembalikan null jika sesi belum memiliki video_url', async () => {
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
});
