import postgresConnection from '@/libs/config/postgresConnection';

export const findGeneration = async (
	idSession: number,
	kind: string
): Promise<Entity.IQaRecordingGeneration | null> => {
	const [row] = await postgresConnection.raw<Entity.IQaRecordingGeneration[]>(
		'SELECT * FROM recording_generations WHERE id_session = $1 AND kind = $2 LIMIT 1',
		[idSession, kind]
	);
	return row ?? null;
};

export const listGenerations = async (
	idSession: number
): Promise<Entity.IQaRecordingGeneration[]> =>
	postgresConnection.raw<Entity.IQaRecordingGeneration[]>(
		'SELECT * FROM recording_generations WHERE id_session = $1 ORDER BY id_generation ASC',
		[idSession]
	);
