import {
	InvalidParameterException,
	NotFoundException,
	NotAuthorizationException
} from '@knittotextile/knitto-core-backend/dist/CoreException';
import {
	presignSessionVideoUseCase,
	completeSessionVideoUseCase,
	getSessionVideoUrlUseCase,
	parseVideoRange,
	videoObjectKeyFromUrl,
	streamSharedSessionVideoUseCase
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

	describe('videoObjectKeyFromUrl', () => {
		it('mengambil object key dari presigned URL host mana pun, tanpa query tanda tangan', () => {
			expect(videoObjectKeyFromUrl('http://127.0.0.1:9000/qa-recording-artifacts/sessions/1/5-video-1.webm?X-Amz-Signature=a')).toBe('sessions/1/5-video-1.webm');
			expect(videoObjectKeyFromUrl('http://192.168.21.38:9000/qa-recording-artifacts/sessions/0/7-video-2.webm')).toBe('sessions/0/7-video-2.webm');
			expect(videoObjectKeyFromUrl('blob:chrome-extension://x/abc')).toBeNull();
		});
	});

	describe('parseVideoRange', () => {
		it('tanpa header Range → kirim utuh', () => {
			expect(parseVideoRange(undefined, 1000)).toBeNull();
			expect(parseVideoRange('bytes=-', 1000)).toBeNull();
		});
		it('rentang terbuka, tertutup, dan suffix', () => {
			expect(parseVideoRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 });
			expect(parseVideoRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 });
			expect(parseVideoRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 });
			expect(parseVideoRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
		});
		it('rentang di luar ukuran file → unsatisfiable (416)', () => {
			expect(parseVideoRange('bytes=1000-', 1000)).toBe('unsatisfiable');
			expect(parseVideoRange('bytes=500-100', 1000)).toBe('unsatisfiable');
		});
	});

	describe('streamSharedSessionVideoUseCase', () => {
		const shared = { ...mockSession, video_url: 'http://127.0.0.1:9000/qa-recording-artifacts/sessions/10/1-video-123.webm?X-Amz-Signature=abc' };

		it('stream lewat share token memakai object key dari video_url, dengan Range parsial', async () => {
			(sessionQueries.findSessionByShareToken as jest.Mock).mockResolvedValue(shared);
			(minioClient.statArtifactObject as jest.Mock).mockResolvedValue({ size: 1000, metaData: { 'content-type': 'video/webm' } });
			(minioClient.getArtifactObjectRange as jest.Mock).mockResolvedValue('partial-stream');

			const video = await streamSharedSessionVideoUseCase({ shareToken: 'tok', range: 'bytes=100-' });
			expect(minioClient.statArtifactObject).toHaveBeenCalledWith('sessions/10/1-video-123.webm');
			expect(minioClient.getArtifactObjectRange).toHaveBeenCalledWith('sessions/10/1-video-123.webm', 100, 900);
			expect(video).toMatchObject({ kind: 'partial', size: 1000, range: { start: 100, end: 999 } });
		});

		it('share token tidak dikenal → NotFoundException', async () => {
			(sessionQueries.findSessionByShareToken as jest.Mock).mockResolvedValue(null);
			await expect(streamSharedSessionVideoUseCase({ shareToken: 'x' })).rejects.toThrow(NotFoundException);
		});

		it('sesi tanpa video → NotFoundException', async () => {
			(sessionQueries.findSessionByShareToken as jest.Mock).mockResolvedValue(mockSession);
			await expect(streamSharedSessionVideoUseCase({ shareToken: 'tok' })).rejects.toThrow(NotFoundException);
		});
	});
});
