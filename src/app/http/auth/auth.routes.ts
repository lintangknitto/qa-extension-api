import { Router, requestHandler, requestValidator } from '@knittotextile/knitto-http';
import controller from './auth.controller';
import request from './auth.request';

const router = Router();

router.post(
	'/auth/login',
	requestValidator({
		requestType: 'body',
		type: request.loginValidation
	}),
	requestHandler(controller.login)
);

router.get('/auth/logout', requestHandler(controller.logout));

export default router;
