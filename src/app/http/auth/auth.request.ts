import { InferOutput, object, string } from 'valibot';
import { ERROR_VALIDATION_MSG } from '@/libs/config/errorMessage';

const loginValidation = object({
	username: string(ERROR_VALIDATION_MSG.string('username')),
	password: string(ERROR_VALIDATION_MSG.string('password'))
});
export type TLoginValidation = InferOutput<typeof loginValidation>;

export default {
	loginValidation
};
