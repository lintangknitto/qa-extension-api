import { Router, requestHandler, requestValidator } from '@knittotextile/knitto-http';
import controller from './generation.controller';
import request from './generation.request';

const router = Router();

// Endpoint yang sama melayani generate awal maupun retry (idempotent per kind).
router.post(
	'/sessions/:id_session/generations',
	requestValidator({ requestType: 'params', type: request.sessionGenerationParamValidation }),
	requestValidator({ requestType: 'body', type: request.generateSessionValidation }),
	requestHandler(controller.generate)
);

router.get(
	'/sessions/:id_session/generations',
	requestValidator({ requestType: 'params', type: request.sessionGenerationParamValidation }),
	requestHandler(controller.list)
);

export default router;
