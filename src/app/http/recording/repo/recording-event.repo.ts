import postgresConnection from '@/libs/config/postgresConnection';
import type { INormalizedRecordingEvent } from '../domain/recording-event.contract';

/**
 * ON CONFLICT (id_session, sequence) DO NOTHING menjadikan unique key sebagai pengaman
 * terakhir terhadap duplikat.
 */
export const insertEventsBatch = async (
	idSession: number,
	events: INormalizedRecordingEvent[]
): Promise<number> => {
	if (events.length === 0) return 0;

	let insertedCount = 0;
	for (const event of events) {
		const res = await postgresConnection.raw<Array<{ id_event: number | string }>>(
			`INSERT INTO recording_events (id_session, sequence, event_type, tab_id, url, payload, occurred_at, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
			 ON CONFLICT (id_session, sequence) DO NOTHING
			 RETURNING id_event`,
			[
				idSession,
				event.sequence,
				event.type,
				event.tabId ?? null,
				event.url ?? null,
				JSON.stringify(event.payload ?? {}),
				event.occurredAt
			]
		);
		if (res && res.length > 0) insertedCount++;
	}

	return insertedCount;
};
