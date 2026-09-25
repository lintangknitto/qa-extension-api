import {
	any,
	InferOutput,
	integer,
	maxLength,
	maxValue,
	minLength,
	minValue,
	nullish,
	number,
	object,
	optional,
	pipe,
	picklist,
	regex,
	string,
	transform
} from 'valibot';
import { ERROR_VALIDATION_MSG } from '@/libs/config/errorMessage';
import { SESSION_RESULTS, SESSION_TEST_CASE_NO_MAX_LENGTH, SESSION_TITLE_MAX_LENGTH } from './domain/session.domain';

const ID_MSG = 'ID tidak valid.';
const DATE_MSG = 'Tanggal harus format YYYY-MM-DD.';

const createSessionValidation = object({
	id_project: nullish(
		pipe(
			number(ERROR_VALIDATION_MSG.number('ID project')),
			integer(ID_MSG),
			minValue(1, ID_MSG)
		)
	),
	id_test_case: nullish(
		pipe(
			number(ERROR_VALIDATION_MSG.number('ID test case')),
			integer(ID_MSG),
			minValue(1, ID_MSG)
		)
	),
	test_case_no: pipe(
		string(ERROR_VALIDATION_MSG.string('Nomor test case')),
		minLength(1, ERROR_VALIDATION_MSG.minLength('Nomor test case', 1)),
		maxLength(SESSION_TEST_CASE_NO_MAX_LENGTH, ERROR_VALIDATION_MSG.maxLength('Nomor test case', SESSION_TEST_CASE_NO_MAX_LENGTH))
	),
	title: pipe(
		string(ERROR_VALIDATION_MSG.string('Judul')),
		minLength(1, ERROR_VALIDATION_MSG.minLength('Judul', 1)),
		maxLength(SESSION_TITLE_MAX_LENGTH, ERROR_VALIDATION_MSG.maxLength('Judul', SESSION_TITLE_MAX_LENGTH))
	),
	description: nullish(
		pipe(string(ERROR_VALIDATION_MSG.string('Deskripsi')), maxLength(5000, ERROR_VALIDATION_MSG.maxLength('Deskripsi', 5000)))
	),
	target_url: nullish(
		pipe(string(ERROR_VALIDATION_MSG.string('Target URL')), maxLength(1000, ERROR_VALIDATION_MSG.maxLength('Target URL', 1000)))
	)
});
export type TCreateSessionValidation = InferOutput<typeof createSessionValidation>;

const sessionIdParamValidation = object({
	id_session: pipe(
		string(ERROR_VALIDATION_MSG.string('ID session')),
		regex(/^\d+$/, ID_MSG),
		transform((value) => Number(value)),
		integer(ID_MSG),
		minValue(1, ID_MSG)
	)
});
export type TSessionIdParamValidation = InferOutput<typeof sessionIdParamValidation>;

const endSessionValidation = object({
	result: picklist([...SESSION_RESULTS], 'Hasil session harus salah satu dari PASS, FAIL, atau BLOCKED.'),
	actual_result: optional(
		pipe(
			string(ERROR_VALIDATION_MSG.string('Actual result')),
			maxLength(5000, ERROR_VALIDATION_MSG.maxLength('Actual result', 5000))
		)
	)
});
export type TEndSessionValidation = InferOutput<typeof endSessionValidation>;

const createCheckpointValidation = object({
	note: pipe(
		string(ERROR_VALIDATION_MSG.string('Catatan checkpoint')),
		minLength(1, ERROR_VALIDATION_MSG.minLength('Catatan checkpoint', 1)),
		maxLength(2000, ERROR_VALIDATION_MSG.maxLength('Catatan checkpoint', 2000))
	),
	sequence: optional(pipe(number(ERROR_VALIDATION_MSG.number('Sequence')), integer(ID_MSG), minValue(0, ID_MSG))),
	id_artifact: optional(pipe(number(ERROR_VALIDATION_MSG.number('ID artifact')), integer(ID_MSG), minValue(1, ID_MSG)))
});
export type TCreateCheckpointValidation = InferOutput<typeof createCheckpointValidation>;

const listSessionValidation = object({
	page: optional(
		pipe(
			any(),
			transform((value) => (value === undefined || value === '' ? 0 : Number(value))),
			integer(ERROR_VALIDATION_MSG.number('Page')),
			minValue(0, ERROR_VALIDATION_MSG.minValue('Page', 0))
		)
	),
	perPage: optional(
		pipe(
			any(),
			transform((value) => (value === undefined || value === '' ? 20 : Number(value))),
			integer(ERROR_VALIDATION_MSG.number('Per Page')),
			minValue(5, ERROR_VALIDATION_MSG.minValue('Per Page', 5)),
			maxValue(100, ERROR_VALIDATION_MSG.maxValue('Per Page', 100))
		)
	),
	id_project: optional(
		pipe(any(), transform((value) => (value === undefined || value === '' ? undefined : Number(value))), integer(ID_MSG), minValue(1, ID_MSG))
	),
	tester_user_id: optional(
		pipe(any(), transform((value) => (value === undefined || value === '' ? undefined : Number(value))), integer(ID_MSG), minValue(1, ID_MSG))
	),
	status: optional(picklist(['recording', 'completed'])),
	result: optional(picklist([...SESSION_RESULTS])),
	date_from: optional(pipe(string(ERROR_VALIDATION_MSG.string('Tanggal awal')), regex(/^\d{4}-\d{2}-\d{2}$/, DATE_MSG))),
	date_to: optional(pipe(string(ERROR_VALIDATION_MSG.string('Tanggal akhir')), regex(/^\d{4}-\d{2}-\d{2}$/, DATE_MSG)))
});
export type TListSessionValidation = InferOutput<typeof listSessionValidation>;

export default {
	createSessionValidation,
	sessionIdParamValidation,
	endSessionValidation,
	createCheckpointValidation,
	listSessionValidation
};
