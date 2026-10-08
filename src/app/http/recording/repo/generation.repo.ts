import postgresConnection from '@/libs/config/postgresConnection';
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
	const [row] = await postgresConnection.raw<Array<{ id_generation: number | string }>>(
		`INSERT INTO recording_generations
			(id_session, kind, status, model, prompt_version, attempt_count, started_at, finished_at, error_message, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, 1, CURRENT_TIMESTAMP, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		 ON CONFLICT (id_session, kind) DO UPDATE SET
			status = EXCLUDED.status,
			model = EXCLUDED.model,
			prompt_version = EXCLUDED.prompt_version,
			attempt_count = recording_generations.attempt_count + 1,
			started_at = CURRENT_TIMESTAMP,
			finished_at = NULL,
			error_message = NULL,
			updated_at = CURRENT_TIMESTAMP
		 RETURNING id_generation`,
		[fields.idSession, fields.kind, GENERATION_STATUS.PROCESSING, fields.model, fields.promptVersion]
	);

	return Number(row?.id_generation ?? 0);
};

export const markGenerationCompleted = async (idGeneration: number, output: string): Promise<void> => {
	await postgresConnection.raw(
		`UPDATE recording_generations
		 SET status = $1, output = $2, error_message = NULL, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		 WHERE id_generation = $3`,
		[GENERATION_STATUS.COMPLETED, output, idGeneration]
	);
};

export const markGenerationFailed = async (idGeneration: number, errorMessage: string): Promise<void> => {
	await postgresConnection.raw(
		`UPDATE recording_generations
		 SET status = $1, error_message = $2, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		 WHERE id_generation = $3`,
		[GENERATION_STATUS.FAILED, errorMessage.slice(0, 500), idGeneration]
	);
};
