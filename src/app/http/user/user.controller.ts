import { TRequestFunction } from '@knittotextile/knitto-http';
import {
	TCreateUserValidation,
	TListUserValidation,
	TResetPasswordValidation,
	TUpdateUserValidation
} from './user.request';
import * as listUsersUseCase from './use-case/list-users.use-case';
import * as createUserUseCase from './use-case/create-user.use-case';
import * as getUserDetailUseCase from './use-case/get-user-detail.use-case';
import * as updateUserUseCase from './use-case/update-user.use-case';
import * as resetPasswordUseCase from './use-case/reset-password.use-case';
import * as deleteUserUseCase from './use-case/delete-user.use-case';

const listUsers: TRequestFunction = async (req) => {
	const query = req.query as unknown as TListUserValidation;
	const result = await listUsersUseCase.listUsersUseCase(query);
	return { result };
};

const createUser: TRequestFunction = async (req) => {
	const body = req.body as TCreateUserValidation;
	const result = await createUserUseCase.createUserUseCase({
		actorLevel: req.userData?.level,
		actorUserId: req.userId,
		body
	});
	return { result };
};

const getUserDetail: TRequestFunction = async (req) => {
	const idUser = Number(req.params.id_user);
	const result = await getUserDetailUseCase.getUserDetailUseCase(idUser);
	return { result };
};

const updateUser: TRequestFunction = async (req) => {
	const idUser = Number(req.params.id_user);
	const body = req.body as TUpdateUserValidation;
	const result = await updateUserUseCase.updateUserUseCase({
		actorLevel: req.userData?.level,
		actorUserId: req.userId,
		idUser,
		body
	});
	return { result };
};

const resetPassword: TRequestFunction = async (req) => {
	const idUser = Number(req.params.id_user);
	const { password } = req.body as TResetPasswordValidation;
	const result = await resetPasswordUseCase.resetPasswordUseCase({
		actorLevel: req.userData?.level,
		idUser,
		password
	});
	return { result };
};

const deleteUser: TRequestFunction = async (req) => {
	const idUser = Number(req.params.id_user);
	const result = await deleteUserUseCase.deleteUserUseCase({
		actorLevel: req.userData?.level,
		actorUserId: req.userId,
		idUser
	});
	return { result };
};

export default {
	listUsers,
	createUser,
	getUserDetail,
	updateUser,
	resetPassword,
	deleteUser
};
