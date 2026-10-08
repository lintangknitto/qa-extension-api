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
