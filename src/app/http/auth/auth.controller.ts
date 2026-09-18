import { TRequestFunction } from '@knittotextile/knitto-http';
import { TLoginValidation } from './auth.request';
import * as loginUseCase from './use-case/login.use-case';
import * as logoutUseCase from './use-case/logout.use-case';

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

export default {
	login,
	logout
};
