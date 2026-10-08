import { Router, requestHandler, requestValidator } from '@knittotextile/knitto-http';
import controller from './program.controller';
import request from './program.request';

const router = Router();

// /programs/active didaftarkan sebelum /programs/:id_program agar tidak dianggap sebagai id_program.
router.get(
	'/programs/active',
	requestValidator({ requestType: 'query', type: request.listProgramValidation }),
	requestHandler(controller.listActive)
);

router.get(
	'/programs',
	requestValidator({ requestType: 'query', type: request.listProgramValidation }),
	requestHandler(controller.list)
);

router.post(
	'/programs',
	requestValidator({ requestType: 'body', type: request.createProgramValidation }),
	requestHandler(controller.create)
);

router.get(
	'/programs/:id_program',
	requestValidator({ requestType: 'params', type: request.programIdParamValidation }),
	requestHandler(controller.detail)
);

router.put(
	'/programs/:id_program',
	requestValidator({ requestType: 'params', type: request.programIdParamValidation }),
	requestValidator({ requestType: 'body', type: request.updateProgramValidation }),
	requestHandler(controller.update)
);

router.delete(
	'/programs/:id_program',
	requestValidator({ requestType: 'params', type: request.programIdParamValidation }),
	requestHandler(controller.remove)
);

export default router;
