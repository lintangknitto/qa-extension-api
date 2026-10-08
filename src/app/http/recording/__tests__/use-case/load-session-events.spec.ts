jest.mock('@/app/http/recording/queries/recording-event.queries', () => ({
	listActionEventsBySession: jest.fn(),
	listEventsBySession: jest.fn(),
	listFailureSignalEventsBySession: jest.fn()
}));

import * as eventQueries from '@/app/http/recording/queries/recording-event.queries';
import { loadSessionEvents } from '../../use-case/load-session-events';
import { collectFailureSignals } from '../../domain/investigation-context';

const row = (sequence: number, event_type: string, payload: Record<string, unknown> = {}) => ({
	id_session: 1,
	sequence,
	event_type,
	occurred_at: '2026-10-08T03:00:00.000Z',
	url: event_type === 'network' ? 'https://api.test/x' : null,
	payload
});

describe('loadSessionEvents', () => {
	it('sesi >2000 event: replay_failure & 5xx di akhir sesi tetap termuat, tanpa duplikasi', async () => {
		// 2000 event network sukses pertama memenuhi batas query umum.
		const firstPage = Array.from({ length: 2000 }, (_, i) => row(i + 1, 'network', { method: 'GET', status: 200 }));
		(eventQueries.listActionEventsBySession as jest.Mock).mockResolvedValue([row(2100, 'action', { action: 'click' })]);
		(eventQueries.listEventsBySession as jest.Mock).mockResolvedValue(firstPage);
		(eventQueries.listFailureSignalEventsBySession as jest.Mock).mockResolvedValue([
			row(2600, 'replay_failure', { step_no: 3, error: 'Elemen tidak ditemukan' }),
			row(2450, 'network', { method: 'POST', status: 503, request_id: 'req-late' })
		]);

		const { events } = await loadSessionEvents(1);
		const signals = collectFailureSignals(events);
		expect(signals.map((s) => s.kind)).toEqual(['network', 'replay']);
		expect(signals[0].requestId).toBe('req-late');
		// Urut sequence dan tiap sequence hanya sekali.
		const sequences = events.map((e) => e.sequence);
		expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
		expect(new Set(sequences).size).toBe(sequences.length);
		expect(sequences).toHaveLength(2000 + 1 + 2);
	});
});
