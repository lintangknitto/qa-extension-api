import { InferOutput, minLength, object, pipe, string } from 'valibot';
import { ERROR_VALIDATION_MSG } from '@/libs/config/errorMessage';

const loginValidation = object({
	username: string(ERROR_VALIDATION_MSG.string('username')),
	password: string(ERROR_VALIDATION_MSG.string('password'))
});
export type TLoginValidation = InferOutput<typeof loginValidation>;

const changePasswordValidation = object({
	old_password: string(ERROR_VALIDATION_MSG.string('old_password')),
	new_password: pipe(
		string(ERROR_VALIDATION_MSG.string('new_password')),
		minLength(6, 'Password baru minimal harus 6 karakter')
	)
});
export type TChangePasswordValidation = InferOutput<typeof changePasswordValidation>;

export default {
	loginValidation,
	changePasswordValidation
};
