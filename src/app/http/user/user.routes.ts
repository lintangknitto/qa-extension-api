import { Router, requestHandler, requestValidator } from '@knittotextile/knitto-http';
import controller from './user.controller';
import request from './user.request';
import { requireRole } from '@/libs/middlewares/requireRole.middleware';

const router = Router();

const adminOnly = requireRole(['SUPERADMIN', 'ADMIN']);

router.get(
	'/users',
	adminOnly,
	requestValidator({ requestType: 'query', type: request.listUserValidation }),
	requestHandler(controller.listUsers)
);

router.post(
	'/users',
	adminOnly,
	requestValidator({ requestType: 'body', type: request.createUserValidation }),
	requestHandler(controller.createUser)
);

router.get(
	'/users/:id_user',
	adminOnly,
	requestValidator({ requestType: 'params', type: request.userIdParamValidation }),
	requestHandler(controller.getUserDetail)
);

router.put(
	'/users/:id_user',
	adminOnly,
	requestValidator({ requestType: 'params', type: request.userIdParamValidation }),
	requestValidator({ requestType: 'body', type: request.updateUserValidation }),
	requestHandler(controller.updateUser)
);

router.patch(
	'/users/:id_user/reset-password',
	adminOnly,
	requestValidator({ requestType: 'params', type: request.userIdParamValidation }),
	requestValidator({ requestType: 'body', type: request.resetPasswordValidation }),
	requestHandler(controller.resetPassword)
);

router.delete(
	'/users/:id_user',
	adminOnly,
	requestValidator({ requestType: 'params', type: request.userIdParamValidation }),
	requestHandler(controller.deleteUser)
);

export default router;
