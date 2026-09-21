import { TRequestFunction } from '@knittotextile/knitto-http';
import type {
	TCreateProjectValidation,
	TListProjectValidation,
	TProjectIdParamValidation,
	TUpdateProjectValidation
} from './project.request';
import { createProjectUseCase } from './use-case/create-project.use-case';
import { updateProjectUseCase } from './use-case/update-project.use-case';
import { detailProjectUseCase } from './use-case/detail-project.use-case';
import { deactivateProjectUseCase } from './use-case/deactivate-project.use-case';
import { listActiveProjectsUseCase, listProjectsUseCase } from './use-case/list-project.use-case';

const create: TRequestFunction = async (req) => {
	const input = req.body as TCreateProjectValidation;
	const result = await createProjectUseCase({
		userId: req.userId,
		userLevel: req.userData?.level,
		input
	});
	return { result, statusCode: 201 };
};

const list: TRequestFunction = async (req) => {
	const input = req.query as unknown as TListProjectValidation;
	const result = await listProjectsUseCase({ userLevel: req.userData?.level, input });
	return { result };
};

const listActive: TRequestFunction = async (req) => {
	const input = req.query as unknown as TListProjectValidation;
	const result = await listActiveProjectsUseCase({ input });
	return { result };
};

const detail: TRequestFunction = async (req) => {
	const params = req.params as unknown as TProjectIdParamValidation;
	const result = await detailProjectUseCase({
		userLevel: req.userData?.level,
		idProject: params.id_project
	});
	return { result };
};

const update: TRequestFunction = async (req) => {
	const params = req.params as unknown as TProjectIdParamValidation;
	const input = req.body as TUpdateProjectValidation;
	const result = await updateProjectUseCase({
		userId: req.userId,
		userLevel: req.userData?.level,
		idProject: params.id_project,
		input
	});
	return { result };
};

const deactivate: TRequestFunction = async (req) => {
	const params = req.params as unknown as TProjectIdParamValidation;
	const result = await deactivateProjectUseCase({
		userLevel: req.userData?.level,
		idProject: params.id_project
	});
	return { result };
};

export default {
	create,
	list,
	listActive,
	detail,
	update,
	deactivate
};
