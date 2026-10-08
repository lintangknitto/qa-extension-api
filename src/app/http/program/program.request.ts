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

const PROGRAM_CODE_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PROGRAM_CODE_MSG = 'Kode program hanya boleh huruf kecil, angka, dan tanda hubung.';
const PROGRAM_ID_MSG = 'ID program tidak valid.';

const codeSchema = pipe(
	string(ERROR_VALIDATION_MSG.string('Kode program')),
	minLength(2, ERROR_VALIDATION_MSG.minLength('Kode program', 2)),
	maxLength(60, ERROR_VALIDATION_MSG.maxLength('Kode program', 60)),
	regex(PROGRAM_CODE_REGEX, PROGRAM_CODE_MSG)
);

const createProgramValidation = object({
	name: pipe(
		string(ERROR_VALIDATION_MSG.string('Nama program')),
		minLength(3, ERROR_VALIDATION_MSG.minLength('Nama program', 3)),
		maxLength(150, ERROR_VALIDATION_MSG.maxLength('Nama program', 150))
	),
	code: optional(codeSchema),
	type: optional(picklist(['FRONTEND', 'SERVICE', 'frontend', 'service'])),
	grafana_dashboard_url: optional(
		pipe(string(ERROR_VALIDATION_MSG.string('Grafana Dashboard URL')), maxLength(500, ERROR_VALIDATION_MSG.maxLength('Grafana Dashboard URL', 500)))
	),
	description: optional(
		pipe(
			string(ERROR_VALIDATION_MSG.string('Deskripsi')),
			maxLength(2000, ERROR_VALIDATION_MSG.maxLength('Deskripsi', 2000))
		)
	),
	base_url: optional(
		pipe(string(ERROR_VALIDATION_MSG.string('Base URL (Staging)')), maxLength(500, ERROR_VALIDATION_MSG.maxLength('Base URL (Staging)', 500)))
	),
	repo_url: optional(
		pipe(string(ERROR_VALIDATION_MSG.string('Repo URL (GitHub)')), maxLength(500, ERROR_VALIDATION_MSG.maxLength('Repo URL (GitHub)', 500)))
	),
	is_active: optional(boolean(ERROR_VALIDATION_MSG.boolean('Status aktif')))
});
export type TCreateProgramValidation = InferOutput<typeof createProgramValidation>;

const updateProgramValidation = object({
	name: optional(
		pipe(
			string(ERROR_VALIDATION_MSG.string('Nama program')),
			minLength(3, ERROR_VALIDATION_MSG.minLength('Nama program', 3)),
			maxLength(150, ERROR_VALIDATION_MSG.maxLength('Nama program', 150))
		)
	),
	code: optional(codeSchema),
	type: optional(picklist(['FRONTEND', 'SERVICE', 'frontend', 'service'])),
	grafana_dashboard_url: optional(
		pipe(string(ERROR_VALIDATION_MSG.string('Grafana Dashboard URL')), maxLength(500, ERROR_VALIDATION_MSG.maxLength('Grafana Dashboard URL', 500)))
	),
	description: optional(
		pipe(
			string(ERROR_VALIDATION_MSG.string('Deskripsi')),
			maxLength(2000, ERROR_VALIDATION_MSG.maxLength('Deskripsi', 2000))
		)
	),
	base_url: optional(
		pipe(string(ERROR_VALIDATION_MSG.string('Base URL (Staging)')), maxLength(500, ERROR_VALIDATION_MSG.maxLength('Base URL (Staging)', 500)))
	),
	repo_url: optional(
		pipe(string(ERROR_VALIDATION_MSG.string('Repo URL (GitHub)')), maxLength(500, ERROR_VALIDATION_MSG.maxLength('Repo URL (GitHub)', 500)))
	),
	is_active: optional(boolean(ERROR_VALIDATION_MSG.boolean('Status aktif')))
});
export type TUpdateProgramValidation = InferOutput<typeof updateProgramValidation>;

const programIdParamValidation = object({
	id_program: pipe(
		string(ERROR_VALIDATION_MSG.string('ID program')),
		regex(/^\d+$/, PROGRAM_ID_MSG),
		transform((value) => Number(value)),
		integer(PROGRAM_ID_MSG),
		minValue(1, PROGRAM_ID_MSG)
	)
});
export type TProgramIdParamValidation = InferOutput<typeof programIdParamValidation>;

const listProgramValidation = object({
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
export type TListProgramValidation = InferOutput<typeof listProgramValidation>;

export default {
	createProgramValidation,
	updateProgramValidation,
	programIdParamValidation,
	listProgramValidation
};
