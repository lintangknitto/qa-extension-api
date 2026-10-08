import { TRequestFunction } from '@knittotextile/knitto-http';
import type {
	TCreateProgramValidation,
	TListProgramValidation,
	TProgramIdParamValidation,
	TUpdateProgramValidation
} from './program.request';
import { createProgramUseCase } from './use-case/create-program.use-case';
import { updateProgramUseCase } from './use-case/update-program.use-case';
import { detailProgramUseCase } from './use-case/detail-program.use-case';
import { deleteProgramUseCase } from './use-case/delete-program.use-case';
import { listActiveProgramsUseCase, listProgramsUseCase } from './use-case/list-programs.use-case';

const create: TRequestFunction = async (req) => {
	const input = req.body as TCreateProgramValidation;
	const result = await createProgramUseCase({
		userId: req.userId,
		userLevel: req.userData?.level,
		input
	});
	return { result, statusCode: 201 };
};

const list: TRequestFunction = async (req) => {
	const input = req.query as unknown as TListProgramValidation;
	const result = await listProgramsUseCase({
		userId: req.userId,
		userLevel: req.userData?.level,
		input
	});
	return { result };
};

const listActive: TRequestFunction = async (req) => {
	const input = req.query as unknown as TListProgramValidation;
	const result = await listActiveProgramsUseCase({
		userId: req.userId,
		userLevel: req.userData?.level,
		input
	});
	return { result };
};

const detail: TRequestFunction = async (req) => {
	const params = req.params as unknown as TProgramIdParamValidation;
	const result = await detailProgramUseCase({
		userLevel: req.userData?.level,
		idProgram: params.id_program
	});
	return { result };
};

const update: TRequestFunction = async (req) => {
	const params = req.params as unknown as TProgramIdParamValidation;
	const input = req.body as TUpdateProgramValidation;
	const result = await updateProgramUseCase({
		userId: req.userId,
		userLevel: req.userData?.level,
		idProgram: params.id_program,
		input
	});
	return { result };
};

const remove: TRequestFunction = async (req) => {
	const params = req.params as unknown as TProgramIdParamValidation;
	const result = await deleteProgramUseCase({
		userId: req.userId,
		userLevel: req.userData?.level,
		idProgram: params.id_program
	});
	return { result };
};

export default {
	create,
	list,
	listActive,
	detail,
	update,
	remove
};
