import {
	InferOutput,
	integer,
	maxValue,
	minLength,
	minValue,
	number,
	object,
	optional,
	pipe,
	regex,
	string,
	transform,
	union,
	boolean
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

export const syncCodebaseBodyValidation = object({
	source_type: optional(string(ERROR_VALIDATION_MSG.string('Source Type'))),
	base_dir: optional(string(ERROR_VALIDATION_MSG.string('Base Directory'))),
	repo_url: optional(string(ERROR_VALIDATION_MSG.string('Repository URL'))),
	branch: optional(string(ERROR_VALIDATION_MSG.string('Branch'))),
	github_token: optional(string(ERROR_VALIDATION_MSG.string('GitHub Token'))),
	force_reindex: optional(boolean())
});
export type TSyncCodebaseBodyValidation = InferOutput<typeof syncCodebaseBodyValidation>;

export const searchCodebaseBodyValidation = object({
	query: pipe(
		string(ERROR_VALIDATION_MSG.string('Query pencarian')),
		transform((v) => v.trim()),
		minLength(1, 'Query pencarian tidak boleh kosong.')
	),
	limit: optional(
		pipe(
			union([
				number(ERROR_VALIDATION_MSG.number('Limit')),
				pipe(
					string(ERROR_VALIDATION_MSG.string('Limit')),
					regex(/^\d+$/, 'Limit harus angka.'),
					transform(Number)
				)
			]),
			integer('Limit harus integer.'),
			minValue(1, 'Limit minimal 1.'),
			maxValue(50, 'Limit maksimal 50.')
		)
	),
	similarity_threshold: optional(
		pipe(
			union([
				number(ERROR_VALIDATION_MSG.number('Similarity Threshold')),
				pipe(
					string(ERROR_VALIDATION_MSG.string('Similarity Threshold')),
					transform(Number)
				)
			]),
			minValue(0, 'Threshold minimal 0.'),
			maxValue(1, 'Threshold maksimal 1.')
		)
	),
	kind: optional(string(ERROR_VALIDATION_MSG.string('Kind')))
});
export type TSearchCodebaseBodyValidation = InferOutput<typeof searchCodebaseBodyValidation>;

export const listSymbolsQueryValidation = object({
	search: optional(string(ERROR_VALIDATION_MSG.string('Search'))),
	kind: optional(string(ERROR_VALIDATION_MSG.string('Kind'))),
	limit: optional(
		pipe(
			union([
				number(ERROR_VALIDATION_MSG.number('Limit')),
				pipe(
					string(ERROR_VALIDATION_MSG.string('Limit')),
					regex(/^\d+$/, 'Limit harus angka.'),
					transform(Number)
				)
			]),
			integer('Limit harus integer.'),
			minValue(1, 'Limit minimal 1.'),
			maxValue(100, 'Limit maksimal 100.')
		)
	)
});
export type TListSymbolsQueryValidation = InferOutput<typeof listSymbolsQueryValidation>;

export default {
	projectParamValidation,
	syncCodebaseBodyValidation,
	searchCodebaseBodyValidation,
	listSymbolsQueryValidation
};
