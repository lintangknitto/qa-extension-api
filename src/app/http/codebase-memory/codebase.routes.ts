import { Router, requestHandler, requestValidator } from '@knittotextile/knitto-http';
import controller from './codebase.controller';
import request from './codebase.request';

const router = Router();

// 1. Sync codebase (AST parsing + pgvector embedding)
router.post(
	'/projects/:id_project/codebase/sync',
	requestValidator({ requestType: 'params', type: request.projectParamValidation }),
	requestValidator({ requestType: 'body', type: request.syncCodebaseBodyValidation }),
	requestHandler(controller.sync)
);

// 2. Semantic vector search codebase
router.post(
	'/projects/:id_project/codebase/search',
	requestValidator({ requestType: 'params', type: request.projectParamValidation }),
	requestValidator({ requestType: 'body', type: request.searchCodebaseBodyValidation }),
	requestHandler(controller.search)
);

// 3. List extracted AST symbols
router.get(
	'/projects/:id_project/codebase/symbols',
	requestValidator({ requestType: 'params', type: request.projectParamValidation }),
	requestValidator({ requestType: 'query', type: request.listSymbolsQueryValidation }),
	requestHandler(controller.listSymbols)
);

export default router;
