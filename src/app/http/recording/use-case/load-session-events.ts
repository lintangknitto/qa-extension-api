import { parseStoredEvent, type IAiInputEvent } from '../domain/ai-input';
import * as eventQueries from '../queries/recording-event.queries';

/**
 * Event sesi untuk generation/investigasi: aksi tester diambil terpisah tanpa batas
 * (agar event network/console sesi yang ramai tidak memotong langkah), sisanya dibatasi.
 * Sinyal kegagalan diambil dengan query sendiri (terbaru dulu) karena `replay_failure`
 * dan request 5xx sering berada di akhir sesi, di luar batas event umum.
 */
export const loadSessionEvents = async (idSession: number): Promise<{ actionEvents: IAiInputEvent[]; events: IAiInputEvent[] }> => {
	const [actionRows, otherRows, signalRows] = await Promise.all([
		eventQueries.listActionEventsBySession(idSession),
		eventQueries.listEventsBySession(idSession, 0, 2000),
		eventQueries.listFailureSignalEventsBySession(idSession)
	]);
	const actionEvents = actionRows.map(parseStoredEvent);
	const bySequence = new Map<number, IAiInputEvent>();
	for (const event of [...otherRows, ...signalRows].map(parseStoredEvent)) {
		if (event.type !== 'action') bySequence.set(event.sequence, event);
	}
	const events = [...actionEvents, ...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
	return { actionEvents, events };
};
