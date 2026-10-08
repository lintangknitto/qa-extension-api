import postgresConnection from '@/libs/config/postgresConnection';

export const findMaxSequence = async (idSession: number): Promise<number> => {
	const [row] = await postgresConnection.raw<Array<{ max_sequence: number | string | null }>>(
		'SELECT MAX(sequence) AS max_sequence FROM recording_events WHERE id_session = $1',
		[idSession]
	);
	return Number(row?.max_sequence ?? 0);
};

export const listEventsBySession = async (
	idSession: number,
	fromSequence = 0,
	limit = 500
): Promise<Array<Entity.IQaRecordingEvent>> =>
	postgresConnection.raw<Array<Entity.IQaRecordingEvent>>(
		`SELECT * FROM recording_events WHERE id_session = $1 AND sequence > ${Number(fromSequence)} ORDER BY sequence ASC LIMIT ${Number(limit)}`,
		[idSession]
	);

/**
 * Event sinyal kegagalan (replay gagal, exception, request ≥400/gagal, console error) dari
 * seluruh sesi — terbaru dulu dengan batas sendiri, supaya sinyal di akhir sesi yang ramai
 * tidak terpotong batas event umum.
 */
export const listFailureSignalEventsBySession = async (idSession: number, limit = 500): Promise<Array<Entity.IQaRecordingEvent>> =>
	postgresConnection.raw<Array<Entity.IQaRecordingEvent>>(
		`SELECT * FROM recording_events
		 WHERE id_session = $1
		   AND (
			event_type IN ('replay_failure', 'exception')
			OR (event_type = 'network' AND (
				payload->>'failed' = 'true'
				-- CASE menjamin cast hanya untuk 1-3 digit (urutan evaluasi AND tidak dijamin Postgres).
				OR (CASE WHEN (payload->>'status') ~ '^[0-9]{1,3}$' THEN (payload->>'status')::int END) >= 400
			))
			OR (event_type = 'console' AND payload->>'level' = 'error')
		   )
		 ORDER BY sequence DESC
		 LIMIT ${Number(limit)}`,
		[idSession]
	);

/**
 * Hanya event aksi tester (klik, input, navigasi) tanpa batas jumlah, supaya
 * event network/console sesi yang ramai tidak memotong langkah tester.
 */
export const listActionEventsBySession = async (idSession: number): Promise<Array<Entity.IQaRecordingEvent>> =>
	postgresConnection.raw<Array<Entity.IQaRecordingEvent>>(
		"SELECT * FROM recording_events WHERE id_session = $1 AND event_type = 'action' ORDER BY sequence ASC",
		[idSession]
	);
