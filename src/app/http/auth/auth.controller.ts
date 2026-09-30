import { TRequestFunction } from '@knittotextile/knitto-http';
import { TLoginValidation, TChangePasswordValidation } from './auth.request';
import * as loginUseCase from './use-case/login.use-case';
import * as logoutUseCase from './use-case/logout.use-case';
import * as changePasswordUseCase from './use-case/change-password.use-case';

const login: TRequestFunction = async (req) => {
	const { username, password } = req.body as TLoginValidation;
	const result = await loginUseCase.loginUseCase({ req, username, password });

	return {
		result
	};
};

const logout: TRequestFunction = async (req) => {
	await logoutUseCase.logoutUseCase({ req, userId: req.userId });
	return {};
};

const changePassword: TRequestFunction = async (req) => {
	const { old_password, new_password } = req.body as TChangePasswordValidation;
	const result = await changePasswordUseCase.changePasswordUseCase({
		userId: req.userId,
		oldPassword: old_password,
		newPassword: new_password
	});

	return {
		result
	};
};

export default {
	login,
	logout,
	changePassword
};
