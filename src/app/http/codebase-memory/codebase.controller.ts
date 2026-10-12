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
import { codebaseStatusUseCase } from './use-case/codebase-status.use-case';

const sync: TRequestFunction = async (req) => {
	const params = req.params as unknown as TProjectParamValidation;
	const body = req.body as unknown as TSyncCodebaseBodyValidation;

	const result = await syncCodebaseUseCase({
		id_project: params.id_project,
		userId: req.userId,
		userLevel: req.userData?.level,
		...body
	});
	// Sync GitHub berjalan di background: `completed: false`, pantau lewat GET .../codebase/status.
	return { result };
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

const status: TRequestFunction = async (req) => {
	const params = req.params as unknown as TProjectParamValidation;
	const result = await codebaseStatusUseCase({ idProject: params.id_project, userId: req.userId, userLevel: req.userData?.level });
	return { result };
};

export default {
	sync,
	status,
	search,
	listSymbols
};
