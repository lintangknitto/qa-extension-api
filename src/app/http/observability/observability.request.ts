import {
	InferOutput,
	integer,
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

export const sessionParamValidation = object({
	id_session: pipe(
		string(ERROR_VALIDATION_MSG.string('ID session')),
		regex(/^\d+$/, ID_MSG),
		transform((value) => Number(value)),
		integer(ID_MSG),
		minValue(1, ID_MSG)
	)
});
export type TSessionParamValidation = InferOutput<typeof sessionParamValidation>;

export const correlateQueryValidation = object({
	logql: optional(string(ERROR_VALIDATION_MSG.string('LogQL'))),
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
export type TCorrelateQueryValidation = InferOutput<typeof correlateQueryValidation>;

export default {
	sessionParamValidation,
	correlateQueryValidation
};
