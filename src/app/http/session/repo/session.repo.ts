import postgresConnection from '@/libs/config/postgresConnection';

export const insertSession = async (fields: {
	idProject?: number | null;
	idTestCase?: number | null;
	testCaseNo: string;
	title: string;
	description?: string | null;
	targetUrl?: string | null;
	ownerUserId: number;
}): Promise<number> => {
	const [row] = await postgresConnection.raw<Array<{ id_session: number | string }>>(
		`INSERT INTO recording_sessions
			(id_project, id_test_case, test_case_no, title, description, target_url, owner_user_id, status, started_at, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, 'recording', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
 		 RETURNING id_session`,
		[
			fields.idProject ?? null,
			fields.idTestCase ?? null,
			fields.testCaseNo,
			fields.title,
			fields.description ?? null,
			fields.targetUrl ?? null,
			fields.ownerUserId
		]
	);
	return Number(row?.id_session);
};

export const completeSession = async (
	idSession: number,
	result: string,
	actualResult: string | null
): Promise<void> => {
	await postgresConnection.raw(
		`UPDATE recording_sessions
		 SET status = 'completed', result = $1, actual_result = $2, ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		 WHERE id_session = $3 AND status = 'recording'`,
		[result, actualResult, idSession]
	);
};

export const discardActiveSessionsByOwner = async (ownerUserId: number): Promise<number> => {
	const rows = await postgresConnection.raw<Array<{ id_session: number }>>(
		`UPDATE recording_sessions
		 SET status = 'completed', result = 'BLOCKED', actual_result = 'Dibatalkan oleh user (discard hanging session)', ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
			 WHERE owner_user_id = $1 AND status = 'recording'
		 RETURNING id_session`,
		[Number(ownerUserId)]
	);
	return rows.length;
};

export const updateLastSequence = async (idSession: number, sequence: number): Promise<void> => {
	await postgresConnection.raw(
		'UPDATE recording_sessions SET last_sequence = GREATEST(last_sequence, $1), updated_at = CURRENT_TIMESTAMP WHERE id_session = $2',
		[sequence, idSession]
	);
};

export const updateSessionShareToken = async (idSession: number, shareToken: string): Promise<void> => {
	await postgresConnection.raw(
		'UPDATE recording_sessions SET share_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id_session = $2',
		[shareToken, idSession]
	);
};

export const updateSessionVideoUrl = async (idSession: number, videoUrl: string): Promise<void> => {
	await postgresConnection.raw(
		'UPDATE recording_sessions SET video_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id_session = $2',
		[videoUrl, idSession]
	);
};

export const insertCheckpoint = async (fields: {
	idSession: number;
	note: string;
	sequence?: number | null;
	idArtifact?: number | null;
	createdByUserId: number;
}): Promise<number> => {
	const [row] = await postgresConnection.raw<Array<{ id_checkpoint: number | string }>>(
		`INSERT INTO recording_checkpoints (id_session, note, sequence, id_artifact, created_by_user_id, created_at)
		 VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
		 RETURNING id_checkpoint`,
		[
			fields.idSession,
			fields.note,
			fields.sequence ?? null,
			fields.idArtifact ?? null,
			fields.createdByUserId
		]
	);
	return Number(row?.id_checkpoint);
};

export const findCheckpointById = async (
	idCheckpoint: number
): Promise<Entity.IQaRecordingCheckpoint | null> => {
	const [row] = await postgresConnection.raw<Entity.IQaRecordingCheckpoint[]>(
		'SELECT * FROM recording_checkpoints WHERE id_checkpoint = $1 LIMIT 1',
		[idCheckpoint]
	);
	return row ?? null;
};
