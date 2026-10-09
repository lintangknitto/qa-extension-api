import { endSessionUseCase } from '../../use-case/end-session.use-case';
import * as queries from '../../queries/session.queries';
import * as repo from '../../repo/session.repo';
import * as runRepo from '../../repo/session-run.repo';
import * as tcRepo from '../../../test-case/repo/test-case.repo';

jest.mock('../../queries/session.queries');
jest.mock('../../repo/session.repo');
jest.mock('../../repo/session-run.repo');
jest.mock('../../../test-case/repo/test-case.repo');

describe('endSessionUseCase', () => {
	const session: Entity.IQaRecordingSession = {
		id_session: 7,
		id_test_case: 3,
		owner_user_id: 5,
		status: 'recording',
		title: 'Login'
	};

	beforeEach(() => {
		jest.clearAllMocks();
		(queries.findSessionById as jest.Mock)
			.mockResolvedValueOnce(session)
			.mockResolvedValueOnce({ ...session, status: 'completed', result: 'FAIL' });
	});

	it('menyelesaikan sesi, membuat Run #1, dan memetakan status test case', async () => {
		await endSessionUseCase({ userId: 5, userLevel: 'QA', idSession: 7, input: { result: 'FAIL', actual_result: 'error' } });

		expect(repo.completeSession).toHaveBeenCalledWith(7, 'FAIL', 'error');
		expect(runRepo.upsertOriginalRun).toHaveBeenCalledWith(7, 5);
		expect((repo.completeSession as jest.Mock).mock.invocationCallOrder[0])
			.toBeLessThan((runRepo.upsertOriginalRun as jest.Mock).mock.invocationCallOrder[0]);
		expect(tcRepo.updateTestCaseStatusAndEvidence).toHaveBeenCalledWith(3, 'Failed', 'error', 7);
	});
});
