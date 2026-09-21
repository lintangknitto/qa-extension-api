import mysqlConnection from '@/libs/config/mysqlConnection';

export interface ISessionFilter {
	idProject?: number;
	testerUserId?: number;
	status?: string;
	result?: string;
	dateFrom?: string;
	dateTo?: string;
}

const buildFilter = (filter: ISessionFilter): { where: string; params: unknown[] } => {
	const clauses: string[] = [];
	const params: unknown[] = [];

	if (filter.idProject !== undefined) {
		clauses.push('id_project = ?');
		params.push(filter.idProject);
	}
	if (filter.testerUserId !== undefined) {
		clauses.push('owner_user_id = ?');
		params.push(filter.testerUserId);
	}
	if (filter.status !== undefined) {
		clauses.push('status = ?');
		params.push(filter.status);
	}
	if (filter.result !== undefined) {
		clauses.push('result = ?');
		params.push(filter.result);
	}
	if (filter.dateFrom !== undefined) {
		clauses.push('created_at >= ?');
		params.push(`${filter.dateFrom} 00:00:00`);
	}
	if (filter.dateTo !== undefined) {
		clauses.push('created_at <= ?');
		params.push(`${filter.dateTo} 23:59:59`);
	}

	return {
		where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
		params
	};
};

export const findSessionById = async (idSession: number): Promise<Entity.IQaRecordingSession | null> => {
	const [row] = await mysqlConnection.raw<Entity.IQaRecordingSession[]>(
		'SELECT * FROM qa_recording_session WHERE id_session = ? LIMIT 1',
		[idSession]
	);
	return row ?? null;
};

export const findActiveSessionByOwner = async (
	ownerUserId: number
): Promise<Entity.IQaRecordingSession | null> => {
	const [row] = await mysqlConnection.raw<Entity.IQaRecordingSession[]>(
		"SELECT * FROM qa_recording_session WHERE owner_user_id = ? AND status = 'recording' LIMIT 1",
		[ownerUserId]
	);
	return row ?? null;
};

export const listSessions = async (options: {
	offset: number;
	perPage: number;
	filter: ISessionFilter;
}): Promise<Entity.IQaRecordingSession[]> => {
	const { where, params } = buildFilter(options.filter);
	// perPage & offset sudah integer tervalidasi dari normalizePagination.
	return mysqlConnection.raw<Entity.IQaRecordingSession[]>(
		`SELECT * FROM qa_recording_session ${where} ORDER BY created_at DESC, id_session DESC LIMIT ${options.perPage} OFFSET ${options.offset}`,
		params
	);
};

export const countSessions = async (filter: ISessionFilter): Promise<number> => {
	const { where, params } = buildFilter(filter);
	const [row] = await mysqlConnection.raw<Array<{ total: number }>>(
		`SELECT COUNT(*) AS total FROM qa_recording_session ${where}`,
		params
	);
	return Number(row?.total ?? 0);
};

export const listCheckpointsBySession = async (
	idSession: number
): Promise<Entity.IQaRecordingCheckpoint[]> =>
	mysqlConnection.raw<Entity.IQaRecordingCheckpoint[]>(
		'SELECT * FROM qa_recording_checkpoint WHERE id_session = ? ORDER BY created_at ASC, id_checkpoint ASC',
		[idSession]
	);
