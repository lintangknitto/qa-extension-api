import { MySqlResultSetHeader } from '@knittotextile/knitto-mysql/dist/libs/MySqlConnector';
import mysqlConnection from '@/libs/config/mysqlConnection';
import type { INormalizedRecordingEvent } from '../domain/recording-event.contract';

/**
 * INSERT IGNORE menjadikan unique key (id_session, sequence) sebagai pengaman
 * terakhir terhadap duplikat, meski pengecekan aplikasi sudah dilakukan.
 */
export const insertEventsBatch = async (
	idSession: number,
	events: INormalizedRecordingEvent[]
): Promise<number> => {
	if (events.length === 0) return 0;

	const placeholders = events.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
	const params: unknown[] = [];

	for (const event of events) {
		params.push(
			idSession,
			event.sequence,
			event.type,
			event.tabId,
			event.url,
			JSON.stringify(event.payload),
			event.occurredAt
		);
	}

	const result = await mysqlConnection.raw<MySqlResultSetHeader>(
		`INSERT IGNORE INTO qa_recording_event (id_session, sequence, event_type, tab_id, url, payload, occurred_at) VALUES ${placeholders}`,
		params
	);

	return Number(result.affectedRows ?? 0);
};
