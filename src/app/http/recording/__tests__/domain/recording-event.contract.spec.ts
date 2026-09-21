import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import {
	RECORDING_EVENT_VERSION,
	normalizeIncomingBatch,
	normalizeIncomingEvent
} from '../../domain/recording-event.contract';

const FALLBACK = '2026-09-18T00:00:00.000Z';

describe('recording-event.contract', () => {
	describe('normalizeIncomingEvent', () => {
		it('menormalkan event valid dengan default version dan payload', () => {
			const result = normalizeIncomingEvent({ type: 'action', sequence: 1 }, FALLBACK);

			expect(result.eventVersion).toBe(RECORDING_EVENT_VERSION);
			expect(result.type).toBe('action');
			expect(result.sequence).toBe(1);
			expect(result.occurredAt).toBe(FALLBACK);
			expect(result.payload).toEqual({});
		});

		it('mempertahankan occurred_at dan field opsional', () => {
			const result = normalizeIncomingEvent(
				{
					event_version: 1,
					type: 'network',
					sequence: 7,
					occurred_at: '2026-09-18T10:00:00.000Z',
					tab_id: 3,
					url: 'https://a.test',
					payload: { method: 'GET' }
				},
				FALLBACK
			);

			expect(result.tabId).toBe(3);
			expect(result.url).toBe('https://a.test');
			expect(result.occurredAt).toBe('2026-09-18T10:00:00.000Z');
		});

		it('menolak versi event yang tidak didukung', () => {
			expect(() => normalizeIncomingEvent({ event_version: 99, type: 'action', sequence: 1 }, FALLBACK)).toThrow(
				InvalidParameterException
			);
		});

		it('menolak tipe event yang tidak dikenal', () => {
			expect(() => normalizeIncomingEvent({ type: 'unknown', sequence: 1 }, FALLBACK)).toThrow(
				InvalidParameterException
			);
		});

		it('menolak sequence yang bukan integer positif', () => {
			expect(() => normalizeIncomingEvent({ type: 'action', sequence: 0 }, FALLBACK)).toThrow(
				InvalidParameterException
			);
			expect(() => normalizeIncomingEvent({ type: 'action', sequence: 1.5 }, FALLBACK)).toThrow(
				InvalidParameterException
			);
		});

		it('menolak occurred_at yang tidak valid', () => {
			expect(() =>
				normalizeIncomingEvent({ type: 'action', sequence: 1, occurred_at: 'bukan-tanggal' }, FALLBACK)
			).toThrow(InvalidParameterException);
		});
	});

	describe('normalizeIncomingBatch', () => {
		it('menolak input yang bukan array', () => {
			expect(() => normalizeIncomingBatch({}, FALLBACK)).toThrow(InvalidParameterException);
		});

		it('menormalkan seluruh item', () => {
			const result = normalizeIncomingBatch(
				[
					{ type: 'action', sequence: 1 },
					{ type: 'console', sequence: 2 }
				],
				FALLBACK
			);
			expect(result.map((event) => event.sequence)).toEqual([1, 2]);
		});
	});
});
