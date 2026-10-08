import { Router, requestHandler, requestValidator } from '@knittotextile/knitto-http';
import controller from './observability.controller';
import request from './observability.request';

const router = Router();

// 1. Health check Grafana connection
router.get(
	'/observability/health',
	requestHandler(controller.health)
);

// 2. List Grafana datasources
router.get(
	'/observability/datasources',
	requestHandler(controller.listDatasources)
);

// 3. Correlate QA session with Grafana Loki error logs & Codebase Memory
router.post(
	'/observability/sessions/:id_session/correlate',
	requestValidator({ requestType: 'params', type: request.sessionParamValidation }),
	requestValidator({ requestType: 'query', type: request.correlateQueryValidation }),
	requestHandler(controller.correlateSession)
);

export default router;
