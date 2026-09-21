import { Router, requestHandler, requestValidator } from '@knittotextile/knitto-http';
import controller from './project.controller';
import request from './project.request';

const router = Router();

// /projects/active harus didaftarkan sebelum /projects/:id_project agar tidak dianggap sebagai id.
router.get(
	'/projects/active',
	requestValidator({ requestType: 'query', type: request.listProjectValidation }),
	requestHandler(controller.listActive)
);

router.get(
	'/projects',
	requestValidator({ requestType: 'query', type: request.listProjectValidation }),
	requestHandler(controller.list)
);

router.post(
	'/projects',
	requestValidator({ requestType: 'body', type: request.createProjectValidation }),
	requestHandler(controller.create)
);

router.get(
	'/projects/:id_project',
	requestValidator({ requestType: 'params', type: request.projectIdParamValidation }),
	requestHandler(controller.detail)
);

router.put(
	'/projects/:id_project',
	requestValidator({ requestType: 'params', type: request.projectIdParamValidation }),
	requestValidator({ requestType: 'body', type: request.updateProjectValidation }),
	requestHandler(controller.update)
);

router.delete(
	'/projects/:id_project',
	requestValidator({ requestType: 'params', type: request.projectIdParamValidation }),
	requestHandler(controller.deactivate)
);

export default router;
