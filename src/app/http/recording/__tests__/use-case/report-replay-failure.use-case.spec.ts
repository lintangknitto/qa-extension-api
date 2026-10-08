jest.mock('@/app/http/session/queries/session.queries', () => ({ findSessionById: jest.fn() }));
jest.mock('@/app/http/recording/repo/recording-event.repo', () => ({ appendServerEvent: jest.fn().mockResolvedValue(30) }));
jest.mock('@/app/http/recording/use-case/load-session-events', () => ({
	loadSessionEvents: jest.fn().mockResolvedValue({ actionEvents: [], events: [{ type: 'replay_failure', sequence: 11, payload: {} }] })
}));
jest.mock('@/app/http/recording/use-case/investigate-session.use-case', () => ({
	startInvestigationInBackground: jest.fn().mockReturnValue('started')
}));

import * as sessionQueries from '@/app/http/session/queries/session.queries';
import * as eventRepo from '@/app/http/recording/repo/recording-event.repo';
import * as investigation from '@/app/http/recording/use-case/investigate-session.use-case';
import { reportReplayFailureUseCase } from '../../use-case/report-replay-failure.use-case';

const OWNER = 7;

describe('reportReplayFailureUseCase', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(sessionQueries.findSessionById as jest.Mock).mockResolvedValue({ id_session: 3, owner_user_id: OWNER, status: 'completed' });
	});

	it('mencatat event replay_failure lalu menjalankan investigasi di background', async () => {
		const result = await reportReplayFailureUseCase({
			idSession: 3,
			userId: OWNER,
			userLevel: 'USER',
			input: { step_no: 4, error: 'Elemen tidak ditemukan', step_description: 'Klik Kirim' }
		});

		expect(result).toEqual({ recorded: true, investigation: 'started' });
		expect(eventRepo.appendServerEvent).toHaveBeenCalledWith(3, 'replay_failure', expect.objectContaining({ step_no: 4, error: 'Elemen tidak ditemukan' }));
		// Investigasi dijalankan di background; event dimuat ulang (termasuk replay_failure baru) saat task berjalan.
		const [session, loadEvents] = (investigation.startInvestigationInBackground as jest.Mock).mock.calls[0];
		expect(session).toMatchObject({ id_session: 3 });
		expect(await loadEvents()).toEqual([{ type: 'replay_failure', sequence: 11, payload: {} }]);
	});

	it('menolak user yang tidak punya akses ke sesi', async () => {
		await expect(
			reportReplayFailureUseCase({ idSession: 3, userId: 99, userLevel: 'USER', input: { step_no: 1, error: 'x' } })
		).rejects.toThrow();
		expect(eventRepo.appendServerEvent).not.toHaveBeenCalled();
	});
});
