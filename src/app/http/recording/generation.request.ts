import { array, InferOutput, object, optional, picklist } from 'valibot';
import { ERROR_VALIDATION_MSG } from '@/libs/config/errorMessage';
import { sessionParamValidation } from './artifact.request';
import { GENERATION_KINDS } from './domain/ai-generation';

export const generateSessionValidation = object({
	kinds: optional(
		array(picklist([...GENERATION_KINDS], 'Jenis generation tidak dikenal.'), ERROR_VALIDATION_MSG.array('Kinds'))
	)
});
export type TGenerateSessionValidation = InferOutput<typeof generateSessionValidation>;

// Params session dipakai ulang agar pola validasi ID konsisten.
export const sessionGenerationParamValidation = sessionParamValidation;
export type TSessionGenerationParamValidation = InferOutput<typeof sessionGenerationParamValidation>;

export default {
	generateSessionValidation,
	sessionGenerationParamValidation
};
