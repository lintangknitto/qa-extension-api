jest.mock('@/app/http/session/queries/session.queries', () => ({ findSessionById: jest.fn() }));
jest.mock('@/app/http/recording/queries/recording-event.queries', () => ({ findMaxSequence: jest.fn() }));
jest.mock('@/app/http/recording/repo/recording-event.repo', () => ({ insertEventsBatch: jest.fn() }));
jest.mock('@/app/http/session/repo/session.repo', () => ({ updateLastSequence: jest.fn() }));

import * as sessionQueries from '@/app/http/session/queries/session.queries';
import * as eventQueries from '@/app/http/recording/queries/recording-event.queries';
import * as eventRepo from '@/app/http/recording/repo/recording-event.repo';
import { updateLastSequence } from '@/app/http/session/repo/session.repo';
import { ingestEventsUseCase } from '../../use-case/ingest-events.use-case';

const SESSION = { id_session: 4, owner_user_id: 7, status: 'recording', last_sequence: 0 };
const context = (rawEvents: unknown) => ({ idSession: 4, userId: 7, userLevel: 'QA', rawEvents });

beforeEach(() => {
	jest.clearAllMocks();
	(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(SESSION);
	(eventQueries.findMaxSequence as jest.Mock).mockResolvedValue(0);
	(eventRepo.insertEventsBatch as jest.Mock).mockImplementation(async (_id: number, events: unknown[]) => events.length);
});

describe('ingestEventsUseCase safety regression', () => {
	it('redacts secrets before persisting and advances the resume cursor', async () => {
		const result = await ingestEventsUseCase(context([{
			type: 'network', sequence: 1, url: 'https://example.test/?token=private',
			payload: { request: { content_type: 'application/json', body: JSON.stringify({ password: 'private' }) } }
		}]));

		const persisted = (eventRepo.insertEventsBatch as jest.Mock).mock.calls[0][1];
		expect(persisted[0].url).toContain('[REDACTED]');
		expect(persisted[0].payload.request.body).toContain('[REDACTED]');
		expect(persisted[0].payload.request.body).not.toContain('private');
		expect(result).toMatchObject({ accepted: 1, inserted: 1, last_sequence: 1, resume: { next_sequence: 2 } });
		expect(updateLastSequence).toHaveBeenCalledWith(4, 1);
	});

	it('deduplicates replayed sequences and does not lower or rewrite the cursor', async () => {
		(eventQueries.findMaxSequence as jest.Mock).mockResolvedValue(5);
		const result = await ingestEventsUseCase(context([
			{ type: 'console', sequence: 5, payload: { text: 'replayed' } },
			{ type: 'console', sequence: 7, payload: { text: 'new' } },
			{ type: 'console', sequence: 7, payload: { text: 'duplicate in batch' } }
		]));

		expect((eventRepo.insertEventsBatch as jest.Mock).mock.calls[0][1].map((event: any) => event.sequence)).toEqual([7]);
		expect(result).toMatchObject({ accepted: 1, duplicates: 2, last_sequence: 7, resume: { next_sequence: 8 } });
		expect(updateLastSequence).toHaveBeenCalledWith(4, 7);
	});

	it('rejects events for a session that is no longer recording without writing', async () => {
		(sessionQueries.findSessionById as jest.Mock).mockResolvedValue({ ...SESSION, status: 'completed' });
		await expect(ingestEventsUseCase(context([{ type: 'console', sequence: 1, payload: {} }]))).rejects.toThrow();
		expect(eventRepo.insertEventsBatch).not.toHaveBeenCalled();
		expect(updateLastSequence).not.toHaveBeenCalled();
	});

	it('rejects malformed batches without writing', async () => {
		await expect(ingestEventsUseCase(context({ not: 'an array' }))).rejects.toThrow();
		expect(eventRepo.insertEventsBatch).not.toHaveBeenCalled();
	});
});
