import { Router, requestHandler, requestValidator } from '@knittotextile/knitto-http';
import controller from './test-case.controller';
import request from './test-case.request';

const router = Router();

// 1. List test cases
router.get(
	'/projects/:id_project/test-cases',
	requestValidator({ requestType: 'params', type: request.projectParamValidation }),
	requestValidator({ requestType: 'query', type: request.listTestCaseValidation }),
	requestHandler(controller.list)
);

// 2. Create single test case
router.post(
	'/projects/:id_project/test-cases',
	requestValidator({ requestType: 'params', type: request.projectParamValidation }),
	requestValidator({ requestType: 'body', type: request.createTestCaseValidation }),
	requestHandler(controller.create)
);

// 3. Bulk import test cases (harus sebelum :id_test_case)
router.post(
	'/projects/:id_project/test-cases/import',
	requestValidator({ requestType: 'params', type: request.projectParamValidation }),
	requestValidator({ requestType: 'body', type: request.importTestCasesValidation }),
	requestHandler(controller.importBulk)
);

// 4. Detail test case
router.get(
	'/projects/:id_project/test-cases/:id_test_case',
	requestValidator({ requestType: 'params', type: request.testCaseParamValidation }),
	requestHandler(controller.detail)
);

// 5. Update test case
router.put(
	'/projects/:id_project/test-cases/:id_test_case',
	requestValidator({ requestType: 'params', type: request.testCaseParamValidation }),
	requestValidator({ requestType: 'body', type: request.updateTestCaseValidation }),
	requestHandler(controller.update)
);

// 6. Delete test case
router.delete(
	'/projects/:id_project/test-cases/:id_test_case',
	requestValidator({ requestType: 'params', type: request.testCaseParamValidation }),
	requestHandler(controller.remove)
);

export default router;
