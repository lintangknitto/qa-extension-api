import {
	any,
	array,
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
	picklist,
	pipe,
	record,
	regex,
	string,
	transform,
	trim
} from 'valibot';
import { ERROR_VALIDATION_MSG } from '@/libs/config/errorMessage';
import { REQUIRED_MAPPING_FIELDS, TEMPLATE_FIELDS } from './domain/test-case-template.domain';

const ID_MSG = 'ID template tidak valid.';

const columnMappingSchema = pipe(
	record(
		picklist(TEMPLATE_FIELDS, 'Field pemetaan tidak dikenal.'),
		object({
			header: pipe(string(ERROR_VALIDATION_MSG.string('Header kolom')), trim(), minLength(1, 'Header kolom wajib diisi.'), maxLength(150)),
			aliases: optional(array(pipe(string(), trim(), maxLength(150))))
		})
	),
	check(
		(mapping) => REQUIRED_MAPPING_FIELDS.every((field) => Boolean(mapping[field])),
		`Pemetaan kolom wajib memiliki ${REQUIRED_MAPPING_FIELDS.join(' dan ')}.`
	)
);

const exportAnchorsSchema = record(string(), any());

const gidSchema = pipe(string(ERROR_VALIDATION_MSG.string('GID')), trim(), regex(/^\d*$/, 'GID harus angka.'), maxLength(30));

export const templateIdParamValidation = object({
	id_template: pipe(
		string(ERROR_VALIDATION_MSG.string('ID template')),
		regex(/^\d+$/, ID_MSG),
		transform((value) => Number(value)),
		integer(ID_MSG),
		minValue(1, ID_MSG)
	)
});
export type TTemplateIdParamValidation = InferOutput<typeof templateIdParamValidation>;

export const listTemplateValidation = object({
	include_inactive: optional(picklist(['true', 'false']))
});
export type TListTemplateValidation = InferOutput<typeof listTemplateValidation>;

export const createTemplateValidation = object({
	version_label: pipe(string(ERROR_VALIDATION_MSG.string('Versi')), trim(), minLength(1, 'Versi wajib diisi.'), maxLength(30)),
	name: pipe(string(ERROR_VALIDATION_MSG.string('Nama template')), trim(), minLength(3), maxLength(150)),
	spreadsheet_url: pipe(
		string(ERROR_VALIDATION_MSG.string('URL spreadsheet')),
		trim(),
		regex(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+/, 'URL harus berupa link Google Spreadsheet.'),
		maxLength(500)
	),
	gid: optional(nullish(gidSchema)),
	column_mapping: columnMappingSchema,
	export_anchors: optional(exportAnchorsSchema),
	is_default: optional(boolean())
});
export type TCreateTemplateValidation = InferOutput<typeof createTemplateValidation>;

export const updateTemplateValidation = object({
	version_label: optional(pipe(string(), trim(), minLength(1, 'Versi wajib diisi.'), maxLength(30))),
	name: optional(pipe(string(), trim(), minLength(3), maxLength(150))),
	spreadsheet_url: optional(
		pipe(string(), trim(), regex(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+/, 'URL harus berupa link Google Spreadsheet.'), maxLength(500))
	),
	gid: optional(nullish(gidSchema)),
	column_mapping: optional(columnMappingSchema),
	export_anchors: optional(exportAnchorsSchema),
	is_active: optional(boolean())
});
export type TUpdateTemplateValidation = InferOutput<typeof updateTemplateValidation>;

export default {
	templateIdParamValidation,
	listTemplateValidation,
	createTemplateValidation,
	updateTemplateValidation
};
