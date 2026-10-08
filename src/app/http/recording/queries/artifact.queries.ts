import postgresConnection from '@/libs/config/postgresConnection';

export const findArtifactById = async (
	idArtifact: number
): Promise<Entity.IQaRecordingArtifact | null> => {
	const [row] = await postgresConnection.raw<Entity.IQaRecordingArtifact[]>(
		'SELECT * FROM recording_artifacts WHERE id_artifact = $1 LIMIT 1',
		[Number(idArtifact)]
	);
	return row ?? null;
};

export const findArtifactByObjectKey = async (
	objectKey: string
): Promise<Entity.IQaRecordingArtifact | null> => {
	const [row] = await postgresConnection.raw<Entity.IQaRecordingArtifact[]>(
		'SELECT * FROM recording_artifacts WHERE object_key = $1 LIMIT 1',
		[objectKey]
	);
	return row ?? null;
};

export const listArtifactsBySession = async (
	idSession: number
): Promise<Entity.IQaRecordingArtifact[]> =>
	postgresConnection.raw<Entity.IQaRecordingArtifact[]>(
		'SELECT * FROM recording_artifacts WHERE id_session = $1 ORDER BY id_artifact ASC',
		[Number(idSession)]
	);
