import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { presignArtifactUploadUseCase } from '../../use-case/presign-artifact-upload.use-case';
import { getArtifactDownloadUrlUseCase } from '../../use-case/get-artifact-download-url.use-case';
import * as artifactQueries from '../../queries/artifact.queries';
import * as artifactRepo from '../../repo/artifact.repo';
import * as sessionQueries from '../../../session/queries/session.queries';
import * as minioClient from '@/libs/config/minioClient';

jest.mock('../../queries/artifact.queries');
jest.mock('../../repo/artifact.repo');
jest.mock('../../../session/queries/session.queries');
jest.mock('@/libs/config/minioClient');

const session = { id_session: 1, id_project: 10, owner_user_id: 5, status: 'recording' };

describe('URL artifact publik (bucket MinIO tanpa signature)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(minioClient.buildPublicObjectUrl as jest.Mock).mockImplementation((key: string) => `http://minio.pub/bucket/${key}`);
		(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(session);
	});

	it('presign upload mengembalikan URL publik untuk object key UUID, field response tetap', async () => {
		(artifactRepo.insertArtifact as jest.Mock).mockResolvedValue(7);
		(artifactQueries.findArtifactById as jest.Mock).mockResolvedValue({ id_artifact: 7, id_session: 1, status: 'pending' });

		const result = await presignArtifactUploadUseCase({
			idSession: 1,
			userId: 5,
			userLevel: 'QA',
			input: { kind: 'screenshot', content_type: 'image/png', size_bytes: 1024 }
		});

		expect(result.object_key).toMatch(/^sessions\/1\/screenshot\/[0-9a-f-]{36}\.png$/);
		expect(result.upload_url).toBe(`http://minio.pub/bucket/${result.object_key}`);
		expect(result).toHaveProperty('expires_in');
		expect(result.artifact).toMatchObject({ id_artifact: 7 });
	});

	it('test_data_file boleh di-presign setelah sesi selesai (file pengganti re-run); kind lain tidak', async () => {
		(sessionQueries.findSessionById as jest.Mock).mockResolvedValue({ ...session, status: 'completed' });
		(artifactRepo.insertArtifact as jest.Mock).mockResolvedValue(8);
		(artifactQueries.findArtifactById as jest.Mock).mockResolvedValue({ id_artifact: 8, id_session: 1, status: 'pending' });
		const presign = (kind: string, content_type: string) =>
			presignArtifactUploadUseCase({ idSession: 1, userId: 5, userLevel: 'QA', input: { kind, content_type, size_bytes: 10 } });

		const result = await presign('test_data_file', 'application/pdf');
		expect(result.object_key).toMatch(/^sessions\/1\/test_data_file\/[0-9a-f-]{36}\.pdf$/);
		await expect(presign('screenshot', 'image/png')).rejects.toThrow(InvalidParameterException);
		await expect(presign('test_data_file', 'text/html')).rejects.toThrow(InvalidParameterException);
	});

	it('download URL adalah URL publik dari object key artifact', async () => {
		(artifactQueries.findArtifactById as jest.Mock).mockResolvedValue({
			id_artifact: 7,
			id_session: 1,
			status: 'uploaded',
			object_key: 'sessions/1/screenshot/a.png'
		});

		const result = await getArtifactDownloadUrlUseCase({ idSession: 1, idArtifact: 7, userId: 5, userLevel: 'QA' });
		expect(result.download_url).toBe('http://minio.pub/bucket/sessions/1/screenshot/a.png');
	});

	it('download ditolak bila artifact belum selesai diupload', async () => {
		(artifactQueries.findArtifactById as jest.Mock).mockResolvedValue({ id_artifact: 7, id_session: 1, status: 'pending', object_key: 'k' });
		await expect(getArtifactDownloadUrlUseCase({ idSession: 1, idArtifact: 7, userId: 5, userLevel: 'QA' })).rejects.toThrow(
			InvalidParameterException
		);
		expect(minioClient.buildPublicObjectUrl).not.toHaveBeenCalled();
	});
});
