import mysqlConnection from '@/libs/config/mysqlConnection';

export const findMaxSequence = async (idSession: number): Promise<number> => {
	const [row] = await mysqlConnection.raw<Array<{ max_sequence: number | null }>>(
		'SELECT MAX(sequence) AS max_sequence FROM qa_recording_event WHERE id_session = ?',
		[idSession]
	);
	return Number(row?.max_sequence ?? 0);
};

export const listEventsBySession = async (
	idSession: number,
	fromSequence = 0,
	limit = 500
): Promise<Array<Entity.IQaRecordingEvent>> =>
	mysqlConnection.raw<Array<Entity.IQaRecordingEvent>>(
		`SELECT * FROM qa_recording_event WHERE id_session = ? AND sequence > ${Number(fromSequence)} ORDER BY sequence ASC LIMIT ${Number(limit)}`,
		[idSession]
	);
