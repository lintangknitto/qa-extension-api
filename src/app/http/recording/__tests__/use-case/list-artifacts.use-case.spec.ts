jest.mock('@/app/http/session/queries/session.queries', () => ({
	findSessionById: jest.fn()
}));

jest.mock('@/app/http/recording/queries/artifact.queries', () => ({
	listArtifactsBySession: jest.fn()
}));

import * as sessionQueries from '@/app/http/session/queries/session.queries';
import * as artifactQueries from '@/app/http/recording/queries/artifact.queries';
import { listArtifactsUseCase } from '../../use-case/list-artifacts.use-case';

const OWNER = 7;

const session = {
	id_session: 1,
	owner_user_id: OWNER,
	status: 'completed',
	test_case_no: 'TC-1',
	title: 'Login',
	last_sequence: 3
};

beforeEach(() => {
	jest.clearAllMocks();
	(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(session);
});

describe('listArtifactsUseCase', () => {
	it('mengembalikan daftar artifact untuk session yang valid', async () => {
		(artifactQueries.listArtifactsBySession as jest.Mock).mockResolvedValue([
			{
				id_artifact: 1,
				id_session: 1,
				kind: 'storage_state',
				object_key: 'sessions/1/artifacts/state.json',
				content_type: 'application/json',
				size_bytes: 1024
			}
		]);

		const res = await listArtifactsUseCase({
			idSession: 1,
			userId: OWNER,
			userLevel: 'IMPLEMENTOR'
		});

		expect(res.items).toHaveLength(1);
		expect(res.items[0].kind).toBe('storage_state');
		expect(res.items[0].size_bytes).toBe(1024);
	});

	it('menolak akses user non-owner dan non-admin', async () => {
		await expect(
			listArtifactsUseCase({
				idSession: 1,
				userId: 99,
				userLevel: 'USER'
			})
		).rejects.toThrow();
	});
});
