import { Router, requestHandler, requestValidator } from '@knittotextile/knitto-http';
import controller from './session.controller';
import request from './session.request';

const router = Router();

router.post(
	'/sessions',
	requestValidator({ requestType: 'body', type: request.createSessionValidation }),
	requestHandler(controller.create)
);

router.get(
	'/sessions',
	requestValidator({ requestType: 'query', type: request.listSessionValidation }),
	requestHandler(controller.list)
);

router.get(
	'/sessions/:id_session',
	requestValidator({ requestType: 'params', type: request.sessionIdParamValidation }),
	requestHandler(controller.detail)
);

router.post(
	'/sessions/:id_session/end',
	requestValidator({ requestType: 'params', type: request.sessionIdParamValidation }),
	requestValidator({ requestType: 'body', type: request.endSessionValidation }),
	requestHandler(controller.end)
);

router.post(
	'/sessions/:id_session/checkpoints',
	requestValidator({ requestType: 'params', type: request.sessionIdParamValidation }),
	requestValidator({ requestType: 'body', type: request.createCheckpointValidation }),
	requestHandler(controller.createCheckpoint)
);

export default router;
