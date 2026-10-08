import { TRequestFunction } from '@knittotextile/knitto-http';
import {
	TProjectParamValidation,
	TSyncCodebaseBodyValidation,
	TSearchCodebaseBodyValidation,
	TListSymbolsQueryValidation
} from './codebase.request';
import { syncCodebaseUseCase } from './use-case/sync-codebase.use-case';
import { searchCodebaseUseCase } from './use-case/search-codebase.use-case';
import { listSymbolsUseCase } from './use-case/list-symbols.use-case';

const sync: TRequestFunction = async (req) => {
	const params = req.params as unknown as TProjectParamValidation;
	const body = req.body as unknown as TSyncCodebaseBodyValidation;

	const result = await syncCodebaseUseCase({
		id_project: params.id_project,
		userId: req.userId,
		userLevel: req.userData?.level,
		...body
	});
	return { result, statusCode: 200 };
};

const search: TRequestFunction = async (req) => {
	const params = req.params as unknown as TProjectParamValidation;
	const body = req.body as unknown as TSearchCodebaseBodyValidation;

	const result = await searchCodebaseUseCase({
		id_project: params.id_project,
		userId: req.userId,
		userLevel: req.userData?.level,
		...body
	});
	return { result };
};

const listSymbols: TRequestFunction = async (req) => {
	const params = req.params as unknown as TProjectParamValidation;
	const query = req.query as unknown as TListSymbolsQueryValidation;

	const result = await listSymbolsUseCase({
		id_project: params.id_project,
		userId: req.userId,
		userLevel: req.userData?.level,
		search: query.search,
		kind: query.kind,
		limit: query.limit
	});
	return { result };
};

export default {
	sync,
	search,
	listSymbols
};
