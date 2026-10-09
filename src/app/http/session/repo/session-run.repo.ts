import postgresConnection from '@/libs/config/postgresConnection';

/** Run #1 (rekaman asli) dibuat/diperbarui dari data sesi saat sesi diakhiri. */
export const upsertOriginalRun = async (idSession: number, createdByUserId: number | null): Promise<void> => {
	await postgresConnection.raw(
		`INSERT INTO recording_session_runs
			(id_session, run_number, kind, result, actual_result, video_object_key, started_at, ended_at, created_by_user_id, created_at)
		 SELECT id_session, 1, 'original', result, actual_result, video_object_key, started_at, ended_at, $2, CURRENT_TIMESTAMP
		 FROM recording_sessions WHERE id_session = $1
		 ON CONFLICT (id_session, run_number) DO UPDATE SET
			result = EXCLUDED.result,
			actual_result = EXCLUDED.actual_result,
			video_object_key = COALESCE(EXCLUDED.video_object_key, recording_session_runs.video_object_key),
			started_at = EXCLUDED.started_at,
			ended_at = EXCLUDED.ended_at`,
		[idSession, createdByUserId]
	);
};

/** Video sesi = video Run #1. No-op bila Run #1 belum ada (dibuat saat sesi diakhiri dan menyalin key sesi). */
export const updateOriginalRunVideoObjectKey = async (idSession: number, objectKey: string): Promise<void> => {
	await postgresConnection.raw(
		'UPDATE recording_session_runs SET video_object_key = $1 WHERE id_session = $2 AND run_number = 1',
		[objectKey, idSession]
	);
};

export const insertRerun = async (fields: {
	idSession: number;
	result: string;
	actualResult: string | null;
	executedSteps: number | null;
	error: string | null;
	startedAt: string | null;
	endedAt: string | null;
	createdByUserId: number;
}): Promise<Entity.IQaRecordingSessionRun> => {
	const params = [
		fields.idSession,
		fields.result,
		fields.actualResult,
		fields.executedSteps,
		fields.error,
		fields.startedAt,
		fields.endedAt,
		fields.createdByUserId
	];
	const sql = `INSERT INTO recording_session_runs
			(id_session, run_number, kind, result, actual_result, executed_steps, error, started_at, ended_at, created_by_user_id, created_at)
		 SELECT $1, COALESCE(MAX(run_number), 0) + 1, 'rerun', $2, $3, $4, $5, COALESCE($6::timestamptz, CURRENT_TIMESTAMP), COALESCE($7::timestamptz, CURRENT_TIMESTAMP), $8, CURRENT_TIMESTAMP
		 FROM recording_session_runs WHERE id_session = $1
		 RETURNING *`;
	try {
		const [row] = await postgresConnection.raw<Entity.IQaRecordingSessionRun[]>(sql, params);
		return row;
	} catch (err) {
		// Dua re-run bersamaan bisa berebut nomor yang sama (unique constraint): coba sekali lagi.
		if ((err as { code?: string }).code !== '23505') throw err;
		const [row] = await postgresConnection.raw<Entity.IQaRecordingSessionRun[]>(sql, params);
		return row;
	}
};

export const updateRunVideoObjectKey = async (idRun: number, objectKey: string): Promise<void> => {
	await postgresConnection.raw('UPDATE recording_session_runs SET video_object_key = $1 WHERE id_run = $2', [
		objectKey,
		idRun
	]);
};

export const findRunByNumber = async (
	idSession: number,
	runNumber: number
): Promise<Entity.IQaRecordingSessionRun | null> => {
	const [row] = await postgresConnection.raw<Entity.IQaRecordingSessionRun[]>(
		'SELECT * FROM recording_session_runs WHERE id_session = $1 AND run_number = $2 LIMIT 1',
		[idSession, runNumber]
	);
	return row ?? null;
};

export const listRunsBySession = async (idSession: number): Promise<Entity.IQaRecordingSessionRun[]> =>
	postgresConnection.raw<Entity.IQaRecordingSessionRun[]>(
		'SELECT * FROM recording_session_runs WHERE id_session = $1 ORDER BY run_number ASC',
		[idSession]
	);
