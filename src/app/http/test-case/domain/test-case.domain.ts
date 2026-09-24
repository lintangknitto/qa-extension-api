import { NotFoundException } from '@knittotextile/knitto-core-backend/dist/CoreException';

export const TEST_CASE_STATUSES = ['Progress', 'Passed', 'Failed', 'Re-Test', 'Skip'] as const;
export type TTestCaseStatus = (typeof TEST_CASE_STATUSES)[number];

export const TEST_TYPES = ['+', '-'] as const;
export type TTestType = (typeof TEST_TYPES)[number];

export const normalizeTestType = (raw: string | undefined | null): string => {
	const trimmed = (raw ?? '').trim();
	if (trimmed === '-' || trimmed.toLowerCase() === 'negative') return '-';
	return '+'; // default positive
};

export const normalizeTestCaseStatus = (raw: string | undefined | null): string => {
	const trimmed = (raw ?? '').trim();
	const found = TEST_CASE_STATUSES.find((s) => s.toLowerCase() === trimmed.toLowerCase());
	return found ?? 'Progress';
};

export const assertTestCaseExists = (
	testCase: Entity.IQaTestCase | null | undefined
): Entity.IQaTestCase => {
	if (!testCase) throw new NotFoundException('Test Case tidak ditemukan.');
	return testCase;
};

export const toTestCaseResponse = (testCase: Entity.IQaTestCase) => {
	const value = (item: unknown): unknown => item ?? null;
	return {
		id_test_case: Number(testCase.id_test_case),
		id_project: Number(testCase.id_project),
		group_no: value(testCase.group_no),
		feature: value(testCase.feature),
		process_no: value(testCase.process_no),
		test_type: testCase.test_type ?? '+',
		test_case_id: String(testCase.test_case_id ?? ''),
		test_variable: value(testCase.test_variable),
		title: String(testCase.title ?? ''),
		pre_condition: value(testCase.pre_condition),
		test_data: value(testCase.test_data),
		test_steps: value(testCase.test_steps),
		expected_result: value(testCase.expected_result),
		actual_result: value(testCase.actual_result),
		status: testCase.status ?? 'Progress',
		evidence: value(testCase.evidence),
		remarks: value(testCase.remarks),
		automation_tools: value(testCase.automation_tools),
		last_session_id: testCase.last_session_id ? Number(testCase.last_session_id) : null,
		created_by_user_id: testCase.created_by_user_id ? Number(testCase.created_by_user_id) : null,
		created_at: value(testCase.created_at),
		updated_at: value(testCase.updated_at)
	};
};
