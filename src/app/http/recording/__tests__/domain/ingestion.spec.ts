import { computeResumeCursor, dedupeAndOrderBatch } from '../../domain/ingestion';

const events = (...sequences: number[]) => sequences.map((sequence) => ({ sequence }));

describe('ingestion', () => {
	describe('dedupeAndOrderBatch', () => {
		it('mengurutkan batch berdasarkan sequence', () => {
			const result = dedupeAndOrderBatch(0, events(3, 1, 2));
			expect(result.accepted.map((e) => e.sequence)).toEqual([1, 2, 3]);
			expect(result.highestAcceptedSequence).toBe(3);
		});

		it('membuang event yang sudah tersimpan (resume)', () => {
			const result = dedupeAndOrderBatch(5, events(4, 5, 6, 7));
			expect(result.accepted.map((e) => e.sequence)).toEqual([6, 7]);
			expect(result.duplicateSequences).toEqual([4, 5]);
			expect(result.highestAcceptedSequence).toBe(7);
		});

		it('membuang duplikat di dalam satu batch', () => {
			const result = dedupeAndOrderBatch(0, events(2, 2, 3));
			expect(result.accepted.map((e) => e.sequence)).toEqual([2, 3]);
			expect(result.duplicateSequences).toEqual([2]);
		});

		it('mempertahankan last sequence saat semua event duplikat', () => {
			const result = dedupeAndOrderBatch(9, events(1, 2));
			expect(result.accepted).toEqual([]);
			expect(result.highestAcceptedSequence).toBe(9);
		});
	});

	describe('computeResumeCursor', () => {
		it('menghitung next sequence dari last sequence', () => {
			expect(computeResumeCursor(0)).toEqual({ last_sequence: 0, next_sequence: 1 });
			expect(computeResumeCursor(12)).toEqual({ last_sequence: 12, next_sequence: 13 });
		});
	});
});
