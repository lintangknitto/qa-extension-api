import mysqlConnection from '@/libs/config/mysqlConnection';

export const findGeneration = async (
	idSession: number,
	kind: string
): Promise<Entity.IQaRecordingGeneration | null> => {
	const [row] = await mysqlConnection.raw<Entity.IQaRecordingGeneration[]>(
		'SELECT * FROM qa_recording_generation WHERE id_session = ? AND kind = ? LIMIT 1',
		[idSession, kind]
	);
	return row ?? null;
};

export const listGenerations = async (
	idSession: number
): Promise<Entity.IQaRecordingGeneration[]> =>
	mysqlConnection.raw<Entity.IQaRecordingGeneration[]>(
		'SELECT * FROM qa_recording_generation WHERE id_session = ? ORDER BY id_generation ASC',
		[idSession]
	);
