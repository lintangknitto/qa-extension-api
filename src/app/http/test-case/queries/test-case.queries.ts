import mysqlConnection from '@/libs/config/mysqlConnection';

export interface ITestCaseFilter {
	search?: string;
	status?: string;
	feature?: string;
	test_type?: string;
	offset?: number;
	limit?: number;
}

export const findTestCasesByProject = async (
	idProject: number,
	filter: ITestCaseFilter = {}
): Promise<Entity.IQaTestCase[]> => {
	const conditions: string[] = ['id_project = ?'];
	const params: (string | number)[] = [idProject];

	if (filter.search) {
		const searchPattern = `%${filter.search.trim()}%`;
		conditions.push('(test_case_id LIKE ? OR title LIKE ? OR feature LIKE ? OR test_variable LIKE ?)');
		params.push(searchPattern, searchPattern, searchPattern, searchPattern);
	}

	if (filter.status) {
		conditions.push('status = ?');
		params.push(filter.status);
	}

	if (filter.feature) {
		conditions.push('feature = ?');
		params.push(filter.feature);
	}

	if (filter.test_type) {
		conditions.push('test_type = ?');
		params.push(filter.test_type);
	}

	let query = `
		SELECT * FROM qa_test_case
		WHERE ${conditions.join(' AND ')}
		ORDER BY id_test_case ASC
	`;

	if (typeof filter.limit === 'number' && filter.limit > 0) {
		const offset = typeof filter.offset === 'number' && filter.offset >= 0 ? filter.offset : 0;
		query += ' LIMIT ? OFFSET ?';
		params.push(filter.limit, offset);
	}

	return mysqlConnection.raw<Entity.IQaTestCase[]>(query, params);
};

export const countTestCasesByProject = async (
	idProject: number,
	filter: ITestCaseFilter = {}
): Promise<number> => {
	const conditions: string[] = ['id_project = ?'];
	const params: (string | number)[] = [idProject];

	if (filter.search) {
		const searchPattern = `%${filter.search.trim()}%`;
		conditions.push('(test_case_id LIKE ? OR title LIKE ? OR feature LIKE ? OR test_variable LIKE ?)');
		params.push(searchPattern, searchPattern, searchPattern, searchPattern);
	}

	if (filter.status) {
		conditions.push('status = ?');
		params.push(filter.status);
	}

	if (filter.feature) {
		conditions.push('feature = ?');
		params.push(filter.feature);
	}

	if (filter.test_type) {
		conditions.push('test_type = ?');
		params.push(filter.test_type);
	}

	const query = `SELECT COUNT(*) AS total FROM qa_test_case WHERE ${conditions.join(' AND ')}`;
	const rows = await mysqlConnection.raw<{ total: number }[]>(query, params);
	return Number(rows[0]?.total ?? 0);
};

export const findTestCaseById = async (
	idTestCase: number
): Promise<Entity.IQaTestCase | null> => {
	const rows = await mysqlConnection.raw<Entity.IQaTestCase[]>(
		'SELECT * FROM qa_test_case WHERE id_test_case = ? LIMIT 1',
		[idTestCase]
	);
	return rows[0] ?? null;
};

export const findTestCaseByCode = async (
	idProject: number,
	testCaseId: string
): Promise<Entity.IQaTestCase | null> => {
	const rows = await mysqlConnection.raw<Entity.IQaTestCase[]>(
		'SELECT * FROM qa_test_case WHERE id_project = ? AND test_case_id = ? LIMIT 1',
		[idProject, testCaseId]
	);
	return rows[0] ?? null;
};

export const getTestCaseSummaryByProject = async (
	idProject: number
): Promise<{
	total: number;
	passed: number;
	failed: number;
	re_test: number;
	progress: number;
	skip: number;
}> => {
	const rows = await mysqlConnection.raw<{ status: string; count: number }[]>(
		`SELECT status, COUNT(*) AS count
		 FROM qa_test_case
		 WHERE id_project = ?
		 GROUP BY status`,
		[idProject]
	);

	const summary = {
		total: 0,
		passed: 0,
		failed: 0,
		re_test: 0,
		progress: 0,
		skip: 0
	};

	for (const row of rows) {
		const count = Number(row.count ?? 0);
		summary.total += count;
		const st = (row.status || '').toLowerCase();
		if (st === 'passed') summary.passed += count;
		else if (st === 'failed') summary.failed += count;
		else if (st === 're-test' || st === 'retest') summary.re_test += count;
		else if (st === 'skip') summary.skip += count;
		else summary.progress += count;
	}

	return summary;
};
