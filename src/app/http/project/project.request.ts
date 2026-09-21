import {
	any,
	boolean,
	InferOutput,
	integer,
	maxLength,
	minLength,
	minValue,
	object,
	optional,
	pipe,
	picklist,
	regex,
	string,
	transform
} from 'valibot';
import { ERROR_VALIDATION_MSG } from '@/libs/config/errorMessage';

const PROJECT_CODE_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PROJECT_CODE_MSG = 'Kode project hanya boleh huruf kecil, angka, dan tanda hubung.';
const PROJECT_ID_MSG = 'ID project tidak valid.';

const codeSchema = pipe(
	string(ERROR_VALIDATION_MSG.string('Kode project')),
	minLength(2, ERROR_VALIDATION_MSG.minLength('Kode project', 2)),
	maxLength(60, ERROR_VALIDATION_MSG.maxLength('Kode project', 60)),
	regex(PROJECT_CODE_REGEX, PROJECT_CODE_MSG)
);

const createProjectValidation = object({
	name: pipe(
		string(ERROR_VALIDATION_MSG.string('Nama project')),
		minLength(3, ERROR_VALIDATION_MSG.minLength('Nama project', 3)),
		maxLength(150, ERROR_VALIDATION_MSG.maxLength('Nama project', 150))
	),
	code: optional(codeSchema),
	description: optional(
		pipe(
			string(ERROR_VALIDATION_MSG.string('Deskripsi')),
			maxLength(2000, ERROR_VALIDATION_MSG.maxLength('Deskripsi', 2000))
		)
	),
	base_url: optional(
		pipe(string(ERROR_VALIDATION_MSG.string('Base URL')), maxLength(500, ERROR_VALIDATION_MSG.maxLength('Base URL', 500)))
	),
	is_active: optional(boolean(ERROR_VALIDATION_MSG.boolean('Status aktif')))
});
export type TCreateProjectValidation = InferOutput<typeof createProjectValidation>;

const updateProjectValidation = object({
	name: optional(
		pipe(
			string(ERROR_VALIDATION_MSG.string('Nama project')),
			minLength(3, ERROR_VALIDATION_MSG.minLength('Nama project', 3)),
			maxLength(150, ERROR_VALIDATION_MSG.maxLength('Nama project', 150))
		)
	),
	code: optional(codeSchema),
	description: optional(
		pipe(
			string(ERROR_VALIDATION_MSG.string('Deskripsi')),
			maxLength(2000, ERROR_VALIDATION_MSG.maxLength('Deskripsi', 2000))
		)
	),
	base_url: optional(
		pipe(string(ERROR_VALIDATION_MSG.string('Base URL')), maxLength(500, ERROR_VALIDATION_MSG.maxLength('Base URL', 500)))
	),
	is_active: optional(boolean(ERROR_VALIDATION_MSG.boolean('Status aktif')))
});
export type TUpdateProjectValidation = InferOutput<typeof updateProjectValidation>;

const projectIdParamValidation = object({
	id_project: pipe(
		string(ERROR_VALIDATION_MSG.string('ID project')),
		regex(/^\d+$/, PROJECT_ID_MSG),
		transform((value) => Number(value)),
		integer(PROJECT_ID_MSG),
		minValue(1, PROJECT_ID_MSG)
	)
});
export type TProjectIdParamValidation = InferOutput<typeof projectIdParamValidation>;

const listProjectValidation = object({
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
			minValue(5, ERROR_VALIDATION_MSG.minValue('Per Page', 5))
		)
	),
	search: optional(
		pipe(string(ERROR_VALIDATION_MSG.string('Pencarian')), maxLength(150, ERROR_VALIDATION_MSG.maxLength('Pencarian', 150)))
	),
	is_active: optional(picklist(['all', 'true', 'false']))
});
export type TListProjectValidation = InferOutput<typeof listProjectValidation>;

export default {
	createProjectValidation,
	updateProjectValidation,
	projectIdParamValidation,
	listProjectValidation
};
