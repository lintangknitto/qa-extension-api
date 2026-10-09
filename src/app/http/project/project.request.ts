import {
	any,
	boolean,
	check,
	InferOutput,
	integer,
	maxLength,
	minLength,
	minValue,
	nullish,
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

const programIdSchema = pipe(
	any(),
	transform((value): number | null => (value === null || value === undefined || value === '' ? null : Number(value))),
	check((value) => value === null || (Number.isSafeInteger(value) && value > 0), PROJECT_ID_MSG)
);

const programIdsSchema = pipe(
	any(),
	transform((value) => {
		if (value === null || value === undefined || value === '') return [];
		return Array.isArray(value) ? value : [value];
	}),
	check(
		(values) => values.every((value) => Number.isSafeInteger(Number(value)) && Number(value) > 0),
		'Program ID harus berupa bilangan bulat positif.'
	),
	transform((values) => values.map(Number))
);

const metadataText = (label: string, max: number) =>
	optional(nullish(pipe(string(ERROR_VALIDATION_MSG.string(label)), maxLength(max, ERROR_VALIDATION_MSG.maxLength(label, max)))));

/** Metadata header format test case V4 (opsional; kosong saat ekspor ditulis `-`). */
const projectMetadataEntries = {
	release_version: metadataText('Versi rilis', 100),
	test_app_folder: metadataText('Folder test app', 255),
	ip_dev: metadataText('IP Dev', 100),
	ip_prod: metadataText('IP Prod', 100),
	tester_name: metadataText('Tester', 150),
	programmer_name: metadataText('Programmer', 150),
	task_dev: metadataText('Task dev', 255),
	brd_id: metadataText('BRD ID', 100),
	link_task_pb: metadataText('Link task PB', 500),
	link_figma: metadataText('Link Figma', 500)
};

const createProjectValidation = object({
	id_program: optional(nullish(programIdSchema)),
	program_ids: optional(nullish(programIdsSchema)),
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
	repo_url: optional(
		pipe(string(ERROR_VALIDATION_MSG.string('Repo URL')), maxLength(500, ERROR_VALIDATION_MSG.maxLength('Repo URL', 500)))
	),
	is_active: optional(boolean(ERROR_VALIDATION_MSG.boolean('Status aktif'))),
	...projectMetadataEntries
});
export type TCreateProjectValidation = InferOutput<typeof createProjectValidation>;

const updateProjectValidation = object({
	id_program: optional(nullish(programIdSchema)),
	program_ids: optional(nullish(programIdsSchema)),
	name: optional(
		pipe(
			string(ERROR_VALIDATION_MSG.string('Nama project')),
			minLength(3, ERROR_VALIDATION_MSG.minLength('Nama project', 3)),
			maxLength(150, ERROR_VALIDATION_MSG.maxLength('Nama project', 150))
		)
	),
	description: optional(
		pipe(
			string(ERROR_VALIDATION_MSG.string('Deskripsi')),
			maxLength(2000, ERROR_VALIDATION_MSG.maxLength('Deskripsi', 2000))
		)
	),
	base_url: optional(
		pipe(string(ERROR_VALIDATION_MSG.string('Base URL')), maxLength(500, ERROR_VALIDATION_MSG.maxLength('Base URL', 500)))
	),
	repo_url: optional(
		pipe(string(ERROR_VALIDATION_MSG.string('Repo URL')), maxLength(500, ERROR_VALIDATION_MSG.maxLength('Repo URL', 500)))
	),
	is_active: optional(boolean(ERROR_VALIDATION_MSG.boolean('Status aktif'))),
	...projectMetadataEntries
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
			transform((value): number => (value === undefined || value === '' ? 0 : Number(value))),
			integer(ERROR_VALIDATION_MSG.number('Page')),
			minValue(0, ERROR_VALIDATION_MSG.minValue('Page', 0))
		)
	),
	perPage: optional(
		pipe(
			any(),
			transform((value): number => (value === undefined || value === '' ? 20 : Number(value))),
			integer(ERROR_VALIDATION_MSG.number('Per Page')),
			minValue(5, ERROR_VALIDATION_MSG.minValue('Per Page', 5))
		)
	),
	search: optional(
		pipe(string(ERROR_VALIDATION_MSG.string('Pencarian')), maxLength(150, ERROR_VALIDATION_MSG.maxLength('Pencarian', 150)))
	),
	id_program: optional(
		pipe(
			any(),
			transform((value): number | undefined => (value === undefined || value === '' ? undefined : Number(value)))
		)
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
