jest.mock('@/app/http/session/queries/session.queries', () => ({
	findSessionById: jest.fn()
}));

jest.mock('@/app/http/session/repo/session.repo', () => ({
	insertCheckpoint: jest.fn(),
	findCheckpointById: jest.fn()
}));

jest.mock('@/app/http/recording/queries/artifact.queries', () => ({
	findArtifactById: jest.fn()
}));

import { NotFoundException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import * as sessionQueries from '@/app/http/session/queries/session.queries';
import * as sessionRepo from '@/app/http/session/repo/session.repo';
import * as artifactQueries from '@/app/http/recording/queries/artifact.queries';
import { createCheckpointUseCase } from '../../use-case/create-checkpoint.use-case';

const OWNER = 7;
const session = { id_session: 1, owner_user_id: OWNER, status: 'recording' };
const checkpoint = { id_checkpoint: 9, id_session: 1, note: 'cek', created_by_user_id: OWNER };

beforeEach(() => {
	jest.clearAllMocks();
	(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(session);
	(sessionRepo.insertCheckpoint as jest.Mock).mockResolvedValue(9);
	(sessionRepo.findCheckpointById as jest.Mock).mockResolvedValue(checkpoint);
	(artifactQueries.findArtifactById as jest.Mock).mockResolvedValue({ id_artifact: 5, id_session: 1 });
});

describe('createCheckpointUseCase (G6)', () => {
	it('menerima checkpoint tanpa artifact', async () => {
		const result = await createCheckpointUseCase({
			userId: OWNER,
			userLevel: 'IMPLEMENTOR',
			idSession: 1,
			input: { note: 'cek' }
		});

		expect(result.id_checkpoint).toBe(9);
		expect(artifactQueries.findArtifactById).not.toHaveBeenCalled();
	});

	it('menerima artifact yang memang milik session', async () => {
		await expect(
			createCheckpointUseCase({
				userId: OWNER,
				userLevel: 'IMPLEMENTOR',
				idSession: 1,
				input: { note: 'cek', id_artifact: 5 }
			})
		).resolves.toBeTruthy();
		expect(artifactQueries.findArtifactById).toHaveBeenCalledWith(5);
	});

	it('menolak artifact milik session lain', async () => {
		(artifactQueries.findArtifactById as jest.Mock).mockResolvedValue({ id_artifact: 5, id_session: 99 });

		await expect(
			createCheckpointUseCase({
				userId: OWNER,
				userLevel: 'IMPLEMENTOR',
				idSession: 1,
				input: { note: 'cek', id_artifact: 5 }
			})
		).rejects.toThrow(NotFoundException);
		expect(sessionRepo.insertCheckpoint).not.toHaveBeenCalled();
	});

	it('menolak artifact yang tidak ditemukan', async () => {
		(artifactQueries.findArtifactById as jest.Mock).mockResolvedValue(null);

		await expect(
			createCheckpointUseCase({
				userId: OWNER,
				userLevel: 'IMPLEMENTOR',
				idSession: 1,
				input: { note: 'cek', id_artifact: 123 }
			})
		).rejects.toThrow(NotFoundException);
	});
});
