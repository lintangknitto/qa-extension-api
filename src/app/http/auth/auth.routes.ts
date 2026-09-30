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

router.post(
	'/auth/change-password',
	requestValidator({
		requestType: 'body',
		type: request.changePasswordValidation
	}),
	requestHandler(controller.changePassword)
);

export default router;
