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

/**
 * Menyimpan event sisi server (mis. `replay_failure`) di sequence berikutnya.
 * Konflik sequence dengan ingest paralel dicoba ulang beberapa kali.
 */
export const appendServerEvent = async (
	idSession: number,
	eventType: string,
	payload: Record<string, unknown>
): Promise<number> => {
	for (let attempt = 0; attempt < 5; attempt++) {
		const [row] = await postgresConnection.raw<Array<{ id_event: number | string }>>(
			`INSERT INTO recording_events (id_session, sequence, event_type, tab_id, url, payload, occurred_at, created_at)
			 SELECT $1, COALESCE(MAX(sequence), 0) + 1, $2, NULL, NULL, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
			 FROM recording_events WHERE id_session = $1
			 ON CONFLICT (id_session, sequence) DO NOTHING
			 RETURNING id_event`,
			[idSession, eventType, JSON.stringify(payload)]
		);
		if (row) return Number(row.id_event);
	}
	throw new Error('Gagal menyimpan event: konflik sequence berulang.');
};
