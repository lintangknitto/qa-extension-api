import { TRequestFunction } from '@knittotextile/knitto-http';
import type {
	TCreateTemplateValidation,
	TListTemplateValidation,
	TTemplateIdParamValidation,
	TUpdateTemplateValidation
} from './test-case-template.request';
import { listTemplatesUseCase } from './use-case/list-templates.use-case';
import { getDefaultTemplateUseCase } from './use-case/get-default-template.use-case';
import { detailTemplateUseCase } from './use-case/detail-template.use-case';
import { createTemplateUseCase } from './use-case/create-template.use-case';
import { updateTemplateUseCase } from './use-case/update-template.use-case';
import { setDefaultTemplateUseCase } from './use-case/set-default-template.use-case';
import { deactivateTemplateUseCase } from './use-case/deactivate-template.use-case';

const list: TRequestFunction = async (req) => {
	const query = req.query as unknown as TListTemplateValidation;
	const result = await listTemplatesUseCase({
		userLevel: req.userData?.level,
		includeInactive: query.include_inactive === 'true'
	});
	return { result };
};

const getDefault: TRequestFunction = async () => {
	const result = await getDefaultTemplateUseCase();
	return { result };
};

const detail: TRequestFunction = async (req) => {
	const params = req.params as unknown as TTemplateIdParamValidation;
	const result = await detailTemplateUseCase({ userLevel: req.userData?.level, idTemplate: params.id_template });
	return { result };
};

const create: TRequestFunction = async (req) => {
	const result = await createTemplateUseCase({
		userId: req.userId,
		userLevel: req.userData?.level,
		input: req.body as TCreateTemplateValidation
	});
	return { result, statusCode: 201 };
};

const update: TRequestFunction = async (req) => {
	const params = req.params as unknown as TTemplateIdParamValidation;
	const result = await updateTemplateUseCase({
		userId: req.userId,
		userLevel: req.userData?.level,
		idTemplate: params.id_template,
		input: req.body as TUpdateTemplateValidation
	});
	return { result };
};

const setDefault: TRequestFunction = async (req) => {
	const params = req.params as unknown as TTemplateIdParamValidation;
	const result = await setDefaultTemplateUseCase({
		userId: req.userId,
		userLevel: req.userData?.level,
		idTemplate: params.id_template
	});
	return { result };
};

const deactivate: TRequestFunction = async (req) => {
	const params = req.params as unknown as TTemplateIdParamValidation;
	const result = await deactivateTemplateUseCase({
		userId: req.userId,
		userLevel: req.userData?.level,
		idTemplate: params.id_template
	});
	return { result };
};

export default { list, getDefault, detail, create, update, setDefault, deactivate };
