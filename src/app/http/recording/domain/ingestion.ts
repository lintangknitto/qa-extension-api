/**
 * Logika murni ingestion: penyaringan duplikat dan pengurutan sequence.
 * Reconnect bisa mengirim ulang event, jadi sequence yang sudah tersimpan
 * (atau duplikat dalam satu batch) harus dibuang agar tidak dobel.
 */
export interface ISequenced {
	sequence: number;
}

export interface IIngestionResult<T> {
	accepted: T[];
	duplicateSequences: number[];
	highestAcceptedSequence: number;
}

export const dedupeAndOrderBatch = <T extends ISequenced>(
	existingMaxSequence: number,
	batch: T[]
): IIngestionResult<T> => {
	const ordered = [...batch].sort((a, b) => a.sequence - b.sequence);
	const seen = new Set<number>();
	const accepted: T[] = [];
	const duplicateSequences: number[] = [];

	for (const event of ordered) {
		if (event.sequence <= existingMaxSequence || seen.has(event.sequence)) {
			duplicateSequences.push(event.sequence);
			continue;
		}
		seen.add(event.sequence);
		accepted.push(event);
	}

	const highestAcceptedSequence = accepted.length > 0 ? accepted[accepted.length - 1].sequence : existingMaxSequence;

	return { accepted, duplicateSequences, highestAcceptedSequence };
};

export const computeResumeCursor = (lastSequence: number): { last_sequence: number; next_sequence: number } => ({
	last_sequence: lastSequence,
	next_sequence: lastSequence + 1
});
