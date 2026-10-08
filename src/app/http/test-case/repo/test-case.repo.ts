import postgresConnection from '@/libs/config/postgresConnection';
import type { TCreateTestCaseValidation, TUpdateTestCaseValidation } from '../test-case.request';
import { normalizeTestCaseStatus, normalizeTestType } from '../domain/test-case.domain';
import { findTestCaseByCode } from '../queries/test-case.queries';

const orNull = <T>(value: T | null | undefined): T | null => value ?? null;

export const insertTestCase = async (
	idProject: number,
	data: TCreateTestCaseValidation,
	userId?: number
): Promise<number> => {
	const [row] = await postgresConnection.raw<Array<{ id_test_case: number | string }>>(
		`INSERT INTO test_cases (
			id_project, id_program, group_no, feature, process_no, test_type,
			test_case_id, test_variable, title, pre_condition,
			test_data, test_steps, expected_result, actual_result,
			status, evidence, remarks, automation_tools, created_by_user_id,
			scenario, test_date,
			created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			$7, $8, $9, $10,
			$11, $12, $13, $14,
			$15, $16, $17, $18, $19,
			$20, $21,
			CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
		)
		RETURNING id_test_case`,
		[
			idProject,
			data.id_program ? Number(data.id_program) : null,
			orNull(data.group_no),
			orNull(data.feature),
			orNull(data.process_no),
			normalizeTestType(data.test_type),
			data.test_case_id.trim(),
			orNull(data.test_variable),
			data.title.trim(),
			orNull(data.pre_condition),
			orNull(data.test_data),
			orNull(data.test_steps),
			orNull(data.expected_result),
			orNull(data.actual_result),
			normalizeTestCaseStatus(data.status),
			orNull(data.evidence),
			orNull(data.remarks),
			orNull(data.automation_tools),
			orNull(userId),
			orNull(data.scenario),
			orNull(data.test_date)
		]
	);

	return Number(row?.id_test_case);
};

const buildUpdateFields = (
	data: TUpdateTestCaseValidation
): { updates: string[]; params: (string | number | null)[] } => {
	const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
	const params: (string | number | null)[] = [];

	const fields: [keyof TUpdateTestCaseValidation, string, ((v: unknown) => string | number | null)?][] = [
		['id_program', 'id_program', (v) => (v ? Number(v) : null)],
		['group_no', 'group_no'],
		['feature', 'feature'],
		['process_no', 'process_no'],
		['test_type', 'test_type', (v) => normalizeTestType(v as string)],
		['test_case_id', 'test_case_id', (v) => (v as string).trim()],
		['test_variable', 'test_variable'],
		['scenario', 'scenario'],
		['title', 'title', (v) => (v as string).trim()],
		['pre_condition', 'pre_condition'],
		['test_data', 'test_data'],
		['test_steps', 'test_steps'],
		['expected_result', 'expected_result'],
		['actual_result', 'actual_result'],
		['status', 'status', (v) => normalizeTestCaseStatus(v as string)],
		['evidence', 'evidence'],
		['remarks', 'remarks'],
		['automation_tools', 'automation_tools'],
		['test_date', 'test_date']
	];

	for (const [key, col, transform] of fields) {
		if (data[key] !== undefined) {
			const raw = data[key];
			params.push(transform ? transform(raw) : (raw ?? null));
			updates.push(`${col} = $${params.length}`);
		}
	}

	return { updates, params };
};

export const updateTestCase = async (
	idTestCase: number,
	data: TUpdateTestCaseValidation
): Promise<void> => {
	const { updates, params } = buildUpdateFields(data);

	if (updates.length <= 1) return; // Only updated_at is present

	params.push(idTestCase);
	await postgresConnection.raw(
		`UPDATE test_cases SET ${updates.join(', ')} WHERE id_test_case = $${params.length}`,
		params
	);
};

export const deleteTestCase = async (idTestCase: number): Promise<void> => {
	await postgresConnection.raw(
		'DELETE FROM test_cases WHERE id_test_case = $1',
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
	await postgresConnection.raw(
		`UPDATE test_cases
		 SET status = $1, actual_result = $2, last_session_id = $3, evidence = $4, updated_at = CURRENT_TIMESTAMP
		 WHERE id_test_case = $5`,
		[normalizeTestCaseStatus(status), actualResult, sessionId, evidenceText, idTestCase]
	);
};
