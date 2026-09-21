import { MySqlResultSetHeader } from '@knittotextile/knitto-mysql/dist/libs/MySqlConnector';
import mysqlConnection from '@/libs/config/mysqlConnection';
import { GENERATION_STATUS } from '../domain/ai-generation';

/**
 * Memulai (atau mengulang) satu baris generation per (session, kind).
 * Upsert membuat retry idempotent tanpa menambah baris baru.
 */
export const startGeneration = async (fields: {
	idSession: number;
	kind: string;
	model: string;
	promptVersion: string;
}): Promise<number> => {
	await mysqlConnection.raw<MySqlResultSetHeader>(
		`INSERT INTO qa_recording_generation
			(id_session, kind, status, model, prompt_version, attempt_count, started_at, finished_at, error_message)
		 VALUES (?, ?, ?, ?, ?, 1, NOW(), NULL, NULL)
		 ON DUPLICATE KEY UPDATE
			status = VALUES(status),
			model = VALUES(model),
			prompt_version = VALUES(prompt_version),
			attempt_count = attempt_count + 1,
			started_at = NOW(),
			finished_at = NULL,
			error_message = NULL`,
		[fields.idSession, fields.kind, GENERATION_STATUS.PROCESSING, fields.model, fields.promptVersion]
	);

	const [row] = await mysqlConnection.raw<Array<{ id_generation: number }>>(
		'SELECT id_generation FROM qa_recording_generation WHERE id_session = ? AND kind = ? LIMIT 1',
		[fields.idSession, fields.kind]
	);

	return Number(row?.id_generation ?? 0);
};

export const markGenerationCompleted = async (idGeneration: number, output: string): Promise<void> => {
	await mysqlConnection.raw<MySqlResultSetHeader>(
		`UPDATE qa_recording_generation
		 SET status = ?, output = ?, error_message = NULL, finished_at = NOW()
		 WHERE id_generation = ?`,
		[GENERATION_STATUS.COMPLETED, output, idGeneration]
	);
};

export const markGenerationFailed = async (idGeneration: number, errorMessage: string): Promise<void> => {
	await mysqlConnection.raw<MySqlResultSetHeader>(
		`UPDATE qa_recording_generation
		 SET status = ?, error_message = ?, finished_at = NOW()
		 WHERE id_generation = ?`,
		[GENERATION_STATUS.FAILED, errorMessage.slice(0, 500), idGeneration]
	);
};
