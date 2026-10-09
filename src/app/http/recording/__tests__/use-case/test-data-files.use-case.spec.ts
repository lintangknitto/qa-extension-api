import {
	InvalidParameterException,
	NotAuthorizationException,
	NotFoundException
} from '@knittotextile/knitto-core-backend/dist/CoreException';
import {
	linkTestDataFilesUseCase,
	listTestDataFiles,
	listTestDataFilesUseCase
} from '../../use-case/test-data-files.use-case';
import * as artifactQueries from '../../queries/artifact.queries';
import * as artifactRepo from '../../repo/artifact.repo';
import * as sessionQueries from '../../../session/queries/session.queries';
import * as minioClient from '@/libs/config/minioClient';

jest.mock('../../queries/artifact.queries');
jest.mock('../../repo/artifact.repo');
jest.mock('../../../session/queries/session.queries');
jest.mock('@/libs/config/minioClient');

const session = { id_session: 1, owner_user_id: 5, status: 'completed' };
const artifact = (id: number, extra: Partial<Entity.IQaRecordingArtifact> = {}): Entity.IQaRecordingArtifact => ({
	id_artifact: id,
	id_session: 1,
	kind: 'test_data_file',
	status: 'uploaded',
	object_key: `sessions/1/test_data_file/${id}.pdf`,
	content_type: 'application/pdf',
	size_bytes: 10,
	sequence: 4,
	file_name: 'invoice.pdf',
	...extra
});
const access = { idSession: 1, userId: 5, userLevel: 'QA' };

describe('file test data re-run', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(session);
		(minioClient.buildPublicObjectUrl as jest.Mock).mockImplementation((key: string) => `http://minio/b/${key}`);
	});

	it('listTestDataFiles: satu per nama file (terbaru menang), hanya test_data_file yang terunggah', () => {
		const result = listTestDataFiles([
			artifact(1),
			artifact(2, { kind: 'screenshot' }),
			artifact(3, { status: 'pending', file_name: 'foto.png' }),
			artifact(4, { file_name: null }),
			artifact(5, { file_name: 'foto.png', content_type: 'image/png', sequence: null }),
			artifact(6, { sequence: 9 })
		]);
		expect(result).toEqual([
			{ id_artifact: 5, file_name: 'foto.png', content_type: 'image/png', size_bytes: 10, sequence: null, download_url: 'http://minio/b/sessions/1/test_data_file/5.pdf' },
			{ id_artifact: 6, file_name: 'invoice.pdf', content_type: 'application/pdf', size_bytes: 10, sequence: 9, download_url: 'http://minio/b/sessions/1/test_data_file/6.pdf' }
		]);
	});

	it('listTestDataFilesUseCase memeriksa akses sesi', async () => {
		(artifactQueries.listArtifactsBySession as jest.Mock).mockResolvedValue([artifact(1)]);
		await expect(listTestDataFilesUseCase(access)).resolves.toHaveLength(1);
		await expect(listTestDataFilesUseCase({ ...access, userId: 99, userLevel: 'VIEWER' })).rejects.toThrow(NotAuthorizationException);
	});

	it('PUT mengaitkan file pengganti ke nama file langkah upload', async () => {
		(artifactQueries.findArtifactById as jest.Mock).mockResolvedValue(artifact(7, { file_name: 'pengganti.pdf', sequence: null }));
		(artifactQueries.listArtifactsBySession as jest.Mock).mockResolvedValue([artifact(1), artifact(7)]);

		const result = await linkTestDataFilesUseCase({ ...access, input: { files: [{ id_artifact: 7, file_name: 'invoice.pdf', sequence: 4 }] } });

		expect(artifactRepo.linkTestDataFile).toHaveBeenCalledWith(7, { fileName: 'invoice.pdf', sequence: 4 });
		expect(result.map((file) => file.id_artifact)).toEqual([7]);
	});

	it('PUT menolak artifact sesi lain, bukan test data, atau belum terunggah', async () => {
		const link = () => linkTestDataFilesUseCase({ ...access, input: { files: [{ id_artifact: 7, file_name: 'a.pdf' }] } });

		(artifactQueries.findArtifactById as jest.Mock).mockResolvedValueOnce(artifact(7, { id_session: 2 }));
		await expect(link()).rejects.toThrow(NotFoundException);
		(artifactQueries.findArtifactById as jest.Mock).mockResolvedValueOnce(artifact(7, { kind: 'screenshot' }));
		await expect(link()).rejects.toThrow(InvalidParameterException);
		(artifactQueries.findArtifactById as jest.Mock).mockResolvedValueOnce(artifact(7, { status: 'pending' }));
		await expect(link()).rejects.toThrow(InvalidParameterException);
		(artifactQueries.findArtifactById as jest.Mock).mockResolvedValueOnce(null);
		await expect(link()).rejects.toThrow(NotFoundException);
		expect(artifactRepo.linkTestDataFile).not.toHaveBeenCalled();
	});
});
