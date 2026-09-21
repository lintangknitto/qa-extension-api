import mysqlConnection from '@/libs/config/mysqlConnection';

export const findArtifactById = async (
	idArtifact: number
): Promise<Entity.IQaRecordingArtifact | null> => {
	const [row] = await mysqlConnection.raw<Entity.IQaRecordingArtifact[]>(
		'SELECT * FROM qa_recording_artifact WHERE id_artifact = ? LIMIT 1',
		[idArtifact]
	);
	return row ?? null;
};

export const findArtifactByObjectKey = async (
	objectKey: string
): Promise<Entity.IQaRecordingArtifact | null> => {
	const [row] = await mysqlConnection.raw<Entity.IQaRecordingArtifact[]>(
		'SELECT * FROM qa_recording_artifact WHERE object_key = ? LIMIT 1',
		[objectKey]
	);
	return row ?? null;
};

export const listArtifactsBySession = async (
	idSession: number
): Promise<Entity.IQaRecordingArtifact[]> =>
	mysqlConnection.raw<Entity.IQaRecordingArtifact[]>(
		'SELECT * FROM qa_recording_artifact WHERE id_session = ? ORDER BY id_artifact ASC',
		[idSession]
	);
