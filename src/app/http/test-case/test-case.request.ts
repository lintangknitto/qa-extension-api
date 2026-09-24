import {
	array,
	InferOutput,
	integer,
	maxLength,
	minValue,
	object,
	optional,
	pipe,
	regex,
	string,
	transform
} from 'valibot';
import { ERROR_VALIDATION_MSG } from '@/libs/config/errorMessage';

const ID_MSG = 'ID tidak valid.';

export const projectParamValidation = object({
	id_project: pipe(
		string(ERROR_VALIDATION_MSG.string('ID project')),
		regex(/^\d+$/, ID_MSG),
		transform((value) => Number(value)),
		integer(ID_MSG),
		minValue(1, ID_MSG)
	)
});
export type TProjectParamValidation = InferOutput<typeof projectParamValidation>;

export const testCaseParamValidation = object({
	id_project: pipe(
		string(ERROR_VALIDATION_MSG.string('ID project')),
		regex(/^\d+$/, ID_MSG),
		transform((value) => Number(value)),
		integer(ID_MSG),
		minValue(1, ID_MSG)
	),
	id_test_case: pipe(
		string(ERROR_VALIDATION_MSG.string('ID test case')),
		regex(/^\d+$/, ID_MSG),
		transform((value) => Number(value)),
		integer(ID_MSG),
		minValue(1, ID_MSG)
	)
});
export type TTestCaseParamValidation = InferOutput<typeof testCaseParamValidation>;

export const listTestCaseValidation = object({
	search: optional(string(ERROR_VALIDATION_MSG.string('Pencarian'))),
	status: optional(string(ERROR_VALIDATION_MSG.string('Status'))),
	feature: optional(string(ERROR_VALIDATION_MSG.string('Feature'))),
	test_type: optional(string(ERROR_VALIDATION_MSG.string('Tipe Test'))),
	page: optional(
		pipe(
			string(ERROR_VALIDATION_MSG.string('Page')),
			regex(/^\d+$/, 'Page harus angka.'),
			transform((v) => Number(v)),
			integer('Page harus integer.'),
			minValue(1, 'Page minimal 1.')
		)
	),
	limit: optional(
		pipe(
			string(ERROR_VALIDATION_MSG.string('Limit')),
			regex(/^\d+$/, 'Limit harus angka.'),
			transform((v) => Number(v)),
			integer('Limit harus integer.'),
			minValue(1, 'Limit minimal 1.')
		)
	)
});
export type TListTestCaseValidation = InferOutput<typeof listTestCaseValidation>;

export const singleTestCaseItemValidation = object({
	test_case_id: pipe(
		string(ERROR_VALIDATION_MSG.string('Test Case ID')),
		maxLength(80, ERROR_VALIDATION_MSG.maxLength('Test Case ID', 80))
	),
	title: pipe(
		string(ERROR_VALIDATION_MSG.string('Judul / Test Case')),
		maxLength(255, ERROR_VALIDATION_MSG.maxLength('Judul / Test Case', 255))
	),
	group_no: optional(pipe(string(), maxLength(50))),
	feature: optional(pipe(string(), maxLength(150))),
	process_no: optional(pipe(string(), maxLength(50))),
	test_type: optional(pipe(string(), maxLength(10))),
	test_variable: optional(pipe(string(), maxLength(255))),
	pre_condition: optional(string()),
	test_data: optional(string()),
	test_steps: optional(string()),
	expected_result: optional(string()),
	actual_result: optional(string()),
	status: optional(pipe(string(), maxLength(30))),
	evidence: optional(string()),
	remarks: optional(string()),
	automation_tools: optional(pipe(string(), maxLength(100)))
});
export type TSingleTestCaseItemValidation = InferOutput<typeof singleTestCaseItemValidation>;

export const createTestCaseValidation = singleTestCaseItemValidation;
export type TCreateTestCaseValidation = InferOutput<typeof createTestCaseValidation>;

export const updateTestCaseValidation = object({
	test_case_id: optional(pipe(string(), maxLength(80))),
	title: optional(pipe(string(), maxLength(255))),
	group_no: optional(pipe(string(), maxLength(50))),
	feature: optional(pipe(string(), maxLength(150))),
	process_no: optional(pipe(string(), maxLength(50))),
	test_type: optional(pipe(string(), maxLength(10))),
	test_variable: optional(pipe(string(), maxLength(255))),
	pre_condition: optional(string()),
	test_data: optional(string()),
	test_steps: optional(string()),
	expected_result: optional(string()),
	actual_result: optional(string()),
	status: optional(pipe(string(), maxLength(30))),
	evidence: optional(string()),
	remarks: optional(string()),
	automation_tools: optional(pipe(string(), maxLength(100)))
});
export type TUpdateTestCaseValidation = InferOutput<typeof updateTestCaseValidation>;

export const importTestCasesValidation = object({
	items: array(singleTestCaseItemValidation)
});
export type TImportTestCasesValidation = InferOutput<typeof importTestCasesValidation>;

export default {
	projectParamValidation,
	testCaseParamValidation,
	listTestCaseValidation,
	createTestCaseValidation,
	updateTestCaseValidation,
	importTestCasesValidation
};
