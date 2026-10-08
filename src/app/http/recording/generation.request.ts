import { array, InferOutput, integer, maxLength, minValue, number, object, optional, picklist, pipe, string } from 'valibot';
import { ERROR_VALIDATION_MSG } from '@/libs/config/errorMessage';
import { sessionParamValidation } from './artifact.request';
import { GENERATION_KINDS } from './domain/ai-generation';

export const generateSessionValidation = object({
	kinds: optional(
		array(picklist([...GENERATION_KINDS], 'Jenis generation tidak dikenal.'), ERROR_VALIDATION_MSG.array('Kinds'))
	)
});
export type TGenerateSessionValidation = InferOutput<typeof generateSessionValidation>;

export const replayFailureValidation = object({
	step_no: pipe(number(ERROR_VALIDATION_MSG.number('Nomor langkah')), integer(), minValue(1)),
	error: pipe(string(ERROR_VALIDATION_MSG.string('Error')), maxLength(2000)),
	step_description: optional(pipe(string(), maxLength(500))),
	selector: optional(pipe(string(), maxLength(500))),
	total_steps: optional(pipe(number(), integer(), minValue(0)))
});
export type TReplayFailureValidation = InferOutput<typeof replayFailureValidation>;

// Params session dipakai ulang agar pola validasi ID konsisten.
export const sessionGenerationParamValidation = sessionParamValidation;
export type TSessionGenerationParamValidation = InferOutput<typeof sessionGenerationParamValidation>;

export default {
	generateSessionValidation,
	replayFailureValidation,
	sessionGenerationParamValidation
};
