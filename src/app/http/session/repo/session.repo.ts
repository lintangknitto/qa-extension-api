import { MySqlResultSetHeader } from '@knittotextile/knitto-mysql/dist/libs/MySqlConnector';
import mysqlConnection from '@/libs/config/mysqlConnection';

export const insertSession = async (fields: {
	idProject: number;
	testCaseNo: string;
	title: string;
	description?: string | null;
	targetUrl?: string | null;
	ownerUserId: number;
}): Promise<number> => {
	const result = await mysqlConnection.raw<MySqlResultSetHeader>(
		`INSERT INTO qa_recording_session
			(id_project, test_case_no, title, description, target_url, owner_user_id, status, started_at)
		 VALUES (?, ?, ?, ?, ?, ?, 'recording', NOW())`,
		[
			fields.idProject,
			fields.testCaseNo,
			fields.title,
			fields.description ?? null,
			fields.targetUrl ?? null,
			fields.ownerUserId
		]
	);
	return Number(result.insertId);
};

export const completeSession = async (
	idSession: number,
	result: string,
	actualResult: string | null
): Promise<void> => {
	await mysqlConnection.raw<MySqlResultSetHeader>(
		`UPDATE qa_recording_session
		 SET status = 'completed', result = ?, actual_result = ?, ended_at = NOW()
		 WHERE id_session = ? AND status = 'recording'`,
		[result, actualResult, idSession]
	);
};

export const updateLastSequence = async (idSession: number, sequence: number): Promise<void> => {
	await mysqlConnection.raw<MySqlResultSetHeader>(
		'UPDATE qa_recording_session SET last_sequence = GREATEST(last_sequence, ?) WHERE id_session = ?',
		[sequence, idSession]
	);
};

export const insertCheckpoint = async (fields: {
	idSession: number;
	note: string;
	sequence?: number | null;
	idArtifact?: number | null;
	createdByUserId: number;
}): Promise<number> => {
	const result = await mysqlConnection.raw<MySqlResultSetHeader>(
		`INSERT INTO qa_recording_checkpoint (id_session, note, sequence, id_artifact, created_by_user_id)
		 VALUES (?, ?, ?, ?, ?)`,
		[
			fields.idSession,
			fields.note,
			fields.sequence ?? null,
			fields.idArtifact ?? null,
			fields.createdByUserId
		]
	);
	return Number(result.insertId);
};

export const findCheckpointById = async (
	idCheckpoint: number
): Promise<Entity.IQaRecordingCheckpoint | null> => {
	const [row] = await mysqlConnection.raw<Entity.IQaRecordingCheckpoint[]>(
		'SELECT * FROM qa_recording_checkpoint WHERE id_checkpoint = ? LIMIT 1',
		[idCheckpoint]
	);
	return row ?? null;
};
