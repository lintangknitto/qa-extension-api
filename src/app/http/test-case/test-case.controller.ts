import { TRequestFunction } from '@knittotextile/knitto-http';
import type {
	TCreateTestCaseValidation,
	TImportTestCasesValidation,
	TListTestCaseValidation,
	TProjectParamValidation,
	TTestCaseParamValidation,
	TUpdateTestCaseValidation
} from './test-case.request';
import { listTestCasesUseCase } from './use-case/list-test-cases.use-case';
import { createTestCaseUseCase } from './use-case/create-test-case.use-case';
import { detailTestCaseUseCase } from './use-case/detail-test-case.use-case';
import { updateTestCaseUseCase } from './use-case/update-test-case.use-case';
import { deleteTestCaseUseCase } from './use-case/delete-test-case.use-case';
import { importTestCasesUseCase } from './use-case/import-test-cases.use-case';

const list: TRequestFunction = async (req) => {
	const params = req.params as unknown as TProjectParamValidation;
	const filter = req.query as unknown as TListTestCaseValidation;
	const result = await listTestCasesUseCase({
		idProject: params.id_project,
		filter
	});
	return { result };
};

const create: TRequestFunction = async (req) => {
	const params = req.params as unknown as TProjectParamValidation;
	const input = req.body as TCreateTestCaseValidation;
	const result = await createTestCaseUseCase({
		idProject: params.id_project,
		input,
		userId: req.userId
	});
	return { result, statusCode: 201 };
};

const detail: TRequestFunction = async (req) => {
	const params = req.params as unknown as TTestCaseParamValidation;
	const result = await detailTestCaseUseCase({
		idProject: params.id_project,
		idTestCase: params.id_test_case
	});
	return { result };
};

const update: TRequestFunction = async (req) => {
	const params = req.params as unknown as TTestCaseParamValidation;
	const input = req.body as TUpdateTestCaseValidation;
	const result = await updateTestCaseUseCase({
		idProject: params.id_project,
		idTestCase: params.id_test_case,
		input
	});
	return { result };
};

const remove: TRequestFunction = async (req) => {
	const params = req.params as unknown as TTestCaseParamValidation;
	const result = await deleteTestCaseUseCase({
		idProject: params.id_project,
		idTestCase: params.id_test_case
	});
	return { result };
};

const importBulk: TRequestFunction = async (req) => {
	const params = req.params as unknown as TProjectParamValidation;
	const body = req.body as TImportTestCasesValidation;
	const result = await importTestCasesUseCase({
		idProject: params.id_project,
		items: body.items,
		userId: req.userId
	});
	return { result };
};

export default {
	list,
	create,
	detail,
	update,
	remove,
	importBulk
};
