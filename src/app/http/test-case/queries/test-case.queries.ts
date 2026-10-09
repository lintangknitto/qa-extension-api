import postgresConnection from '@/libs/config/postgresConnection';

export interface ITestCaseFilter {
	search?: string;
	status?: string;
	feature?: string;
	test_type?: string;
	id_program?: number;
	offset?: number;
	limit?: number;
}

export const findTestCasesByProject = async (
	idProject: number,
	filter: ITestCaseFilter = {}
): Promise<Entity.IQaTestCase[]> => {
	const conditions: string[] = ['tc.id_project = ?'];
	const params: (string | number)[] = [idProject];

	if (filter.search) {
		const searchPattern = `%${filter.search.trim()}%`;
		conditions.push('(tc.test_case_id ILIKE ? OR tc.title ILIKE ? OR tc.scenario ILIKE ? OR tc.feature ILIKE ? OR tc.test_variable ILIKE ? OR prg.name ILIKE ?)');
		params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
	}

	if (filter.status) {
		conditions.push('tc.status = ?');
		params.push(filter.status);
	}

	if (filter.feature) {
		conditions.push('tc.feature = ?');
		params.push(filter.feature);
	}

	if (filter.test_type) {
		conditions.push('tc.test_type = ?');
		params.push(filter.test_type);
	}

	if (filter.id_program !== undefined) {
		conditions.push('tc.id_program = ?');
		params.push(filter.id_program);
	}

	let query = `
		SELECT tc.*,
		       prg.name AS program_name,
		       prg.code AS program_code,
		       prg.type AS program_type,
		       prg.base_url AS program_base_url,
		       prg.repo_url AS program_repo_url
		FROM test_cases tc
		LEFT JOIN programs prg ON prg.id_program = tc.id_program
		WHERE ${conditions.join(' AND ')}
		ORDER BY tc.id_test_case ASC
	`;

	if (typeof filter.limit === 'number' && filter.limit > 0) {
		const offset = typeof filter.offset === 'number' && filter.offset >= 0 ? filter.offset : 0;
		query += ' LIMIT ? OFFSET ?';
		params.push(filter.limit, offset);
	}

	return postgresConnection.raw<Entity.IQaTestCase[]>(query, params);
};

export const countTestCasesByProject = async (
	idProject: number,
	filter: ITestCaseFilter = {}
): Promise<number> => {
	const conditions: string[] = ['tc.id_project = ?'];
	const params: (string | number)[] = [idProject];

	if (filter.search) {
		const searchPattern = `%${filter.search.trim()}%`;
		conditions.push('(tc.test_case_id ILIKE ? OR tc.title ILIKE ? OR tc.scenario ILIKE ? OR tc.feature ILIKE ? OR tc.test_variable ILIKE ? OR prg.name ILIKE ?)');
		params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
	}

	if (filter.status) {
		conditions.push('tc.status = ?');
		params.push(filter.status);
	}

	if (filter.feature) {
		conditions.push('tc.feature = ?');
		params.push(filter.feature);
	}

	if (filter.test_type) {
		conditions.push('tc.test_type = ?');
		params.push(filter.test_type);
	}

	if (filter.id_program !== undefined) {
		conditions.push('tc.id_program = ?');
		params.push(filter.id_program);
	}

	const query = `
		SELECT COUNT(*) AS total
		FROM test_cases tc
		LEFT JOIN programs prg ON prg.id_program = tc.id_program
		WHERE ${conditions.join(' AND ')}
	`;
	const rows = await postgresConnection.raw<Array<{ total: string | number }>>(query, params);
	return Number(rows[0]?.total ?? 0);
};

export const findTestCaseById = async (
	idTestCase: number
): Promise<Entity.IQaTestCase | null> => {
	const rows = await postgresConnection.raw<Entity.IQaTestCase[]>(
		`SELECT tc.*,
		        prg.name AS program_name,
		        prg.code AS program_code
		 FROM test_cases tc
		 LEFT JOIN programs prg ON prg.id_program = tc.id_program
		 WHERE tc.id_test_case = ?
		 LIMIT 1`,
		[idTestCase]
	);
	return rows[0] ?? null;
};

export const findTestCaseByCode = async (
	idProject: number,
	testCaseId: string
): Promise<Entity.IQaTestCase | null> => {
	const rows = await postgresConnection.raw<Entity.IQaTestCase[]>(
		`SELECT tc.*,
		        prg.name AS program_name,
		        prg.code AS program_code
		 FROM test_cases tc
		 LEFT JOIN programs prg ON prg.id_program = tc.id_program
		 WHERE tc.id_project = ? AND tc.test_case_id = ?
		 LIMIT 1`,
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
	const rows = await postgresConnection.raw<{ status: string; count: string | number }[]>(
		`SELECT status, COUNT(*) AS count
		 FROM test_cases
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
