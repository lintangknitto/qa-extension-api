import { Router, requestHandler, requestValidator } from '@knittotextile/knitto-http';
import { requireRole } from '@/libs/middlewares/requireRole.middleware';
import controller from './test-case-template.controller';
import request from './test-case-template.request';
import { TEMPLATE_ADMIN_LEVELS } from './domain/test-case-template.domain';

const router = Router();

const adminOnly = requireRole(TEMPLATE_ADMIN_LEVELS);

// 1. List template (semua user login; include_inactive hanya berlaku untuk admin)
router.get(
	'/test-case-templates',
	requestValidator({ requestType: 'query', type: request.listTemplateValidation }),
	requestHandler(controller.list)
);

// 2. Template default (harus sebelum :id_template)
router.get('/test-case-templates/default', requestHandler(controller.getDefault));

// 3. Detail template
router.get(
	'/test-case-templates/:id_template',
	adminOnly,
	requestValidator({ requestType: 'params', type: request.templateIdParamValidation }),
	requestHandler(controller.detail)
);

// 4. Create template
router.post(
	'/test-case-templates',
	adminOnly,
	requestValidator({ requestType: 'body', type: request.createTemplateValidation }),
	requestHandler(controller.create)
);

// 5. Update template
router.put(
	'/test-case-templates/:id_template',
	adminOnly,
	requestValidator({ requestType: 'params', type: request.templateIdParamValidation }),
	requestValidator({ requestType: 'body', type: request.updateTemplateValidation }),
	requestHandler(controller.update)
);

// 6. Jadikan default
router.patch(
	'/test-case-templates/:id_template/default',
	adminOnly,
	requestValidator({ requestType: 'params', type: request.templateIdParamValidation }),
	requestHandler(controller.setDefault)
);

// 7. Nonaktifkan
router.patch(
	'/test-case-templates/:id_template/deactivate',
	adminOnly,
	requestValidator({ requestType: 'params', type: request.templateIdParamValidation }),
	requestHandler(controller.deactivate)
);

export default router;
