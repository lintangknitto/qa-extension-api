import { MySqlResultSetHeader } from '@knittotextile/knitto-mysql/dist/libs/MySqlConnector';
import mysqlConnection from '@/libs/config/mysqlConnection';
import type { TCreateTestCaseValidation, TUpdateTestCaseValidation } from '../test-case.request';
import { normalizeTestCaseStatus, normalizeTestType } from '../domain/test-case.domain';
import { findTestCaseByCode } from '../queries/test-case.queries';

export const insertTestCase = async (
	idProject: number,
	data: TCreateTestCaseValidation,
	userId?: number
): Promise<number> => {
	const result = await mysqlConnection.raw<MySqlResultSetHeader>(
		`INSERT INTO qa_test_case (
			id_project, group_no, feature, process_no, test_type,
			test_case_id, test_variable, title, pre_condition,
			test_data, test_steps, expected_result, actual_result,
			status, evidence, remarks, automation_tools, created_by_user_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			idProject,
			data.group_no ?? null,
			data.feature ?? null,
			data.process_no ?? null,
			normalizeTestType(data.test_type),
			data.test_case_id.trim(),
			data.test_variable ?? null,
			data.title.trim(),
			data.pre_condition ?? null,
			data.test_data ?? null,
			data.test_steps ?? null,
			data.expected_result ?? null,
			data.actual_result ?? null,
			normalizeTestCaseStatus(data.status),
			data.evidence ?? null,
			data.remarks ?? null,
			data.automation_tools ?? null,
			userId ?? null
		]
	);

	return Number(result.insertId);
};

const buildUpdateFields = (
	data: TUpdateTestCaseValidation
): { updates: string[]; params: (string | number | null)[] } => {
	const updates: string[] = [];
	const params: (string | number | null)[] = [];

	const fields: [keyof TUpdateTestCaseValidation, string, ((v: unknown) => string | number | null)?][] = [
		['group_no', 'group_no'],
		['feature', 'feature'],
		['process_no', 'process_no'],
		['test_type', 'test_type', (v) => normalizeTestType(v as string)],
		['test_case_id', 'test_case_id', (v) => (v as string).trim()],
		['test_variable', 'test_variable'],
		['title', 'title', (v) => (v as string).trim()],
		['pre_condition', 'pre_condition'],
		['test_data', 'test_data'],
		['test_steps', 'test_steps'],
		['expected_result', 'expected_result'],
		['actual_result', 'actual_result'],
		['status', 'status', (v) => normalizeTestCaseStatus(v as string)],
		['evidence', 'evidence'],
		['remarks', 'remarks'],
		['automation_tools', 'automation_tools']
	];

	for (const [key, col, transform] of fields) {
		if (data[key] !== undefined) {
			updates.push(`${col} = ?`);
			const raw = data[key] as string | number | null | undefined;
			params.push(transform ? transform(raw) : (raw ?? null));
		}
	}

	return { updates, params };
};

export const updateTestCase = async (
	idTestCase: number,
	data: TUpdateTestCaseValidation
): Promise<void> => {
	const { updates, params } = buildUpdateFields(data);

	if (updates.length === 0) return;

	params.push(idTestCase);
	await mysqlConnection.raw<MySqlResultSetHeader>(
		`UPDATE qa_test_case SET ${updates.join(', ')} WHERE id_test_case = ?`,
		params
	);
};

export const deleteTestCase = async (idTestCase: number): Promise<void> => {
	await mysqlConnection.raw<MySqlResultSetHeader>(
		'DELETE FROM qa_test_case WHERE id_test_case = ?',
		[idTestCase]
	);
};

export const upsertSingleTestCase = async (
	idProject: number,
	item: TCreateTestCaseValidation,
	userId?: number
): Promise<{ action: 'inserted' | 'updated'; id: number }> => {
	const existing = await findTestCaseByCode(idProject, item.test_case_id.trim());
	if (existing && existing.id_test_case) {
		await updateTestCase(Number(existing.id_test_case), item);
		return { action: 'updated', id: Number(existing.id_test_case) };
	}

	const insertId = await insertTestCase(idProject, item, userId);
	return { action: 'inserted', id: insertId };
};

export const bulkUpsertTestCases = async (
	idProject: number,
	items: TCreateTestCaseValidation[],
	userId?: number
): Promise<{ total: number; inserted: number; updated: number }> => {
	let inserted = 0;
	let updated = 0;

	for (const item of items) {
		const res = await upsertSingleTestCase(idProject, item, userId);
		if (res.action === 'inserted') inserted++;
		else updated++;
	}

	return {
		total: items.length,
		inserted,
		updated
	};
};

export const updateTestCaseStatusAndEvidence = async (
	idTestCase: number,
	status: string,
	actualResult: string | null,
	sessionId: number
): Promise<void> => {
	const evidenceText = `Session #${sessionId}`;
	await mysqlConnection.raw<MySqlResultSetHeader>(
		`UPDATE qa_test_case
		 SET status = ?, actual_result = ?, last_session_id = ?, evidence = ?
		 WHERE id_test_case = ?`,
		[normalizeTestCaseStatus(status), actualResult, sessionId, evidenceText, idTestCase]
	);
};
