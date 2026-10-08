import { TRequestFunction } from '@knittotextile/knitto-http';
import grafanaService from './services/grafana.service';
import { correlateSessionLogsUseCase } from './use-case/correlate-session-logs.use-case';
import { TSessionParamValidation, TCorrelateQueryValidation } from './observability.request';

const health: TRequestFunction = async () => {
	const result = await grafanaService.checkHealth();
	return { result };
};

const listDatasources: TRequestFunction = async () => {
	const result = await grafanaService.listDatasources();
	return { result };
};

const correlateSession: TRequestFunction = async (req) => {
	const params = req.params as unknown as TSessionParamValidation;
	const query = req.query as unknown as TCorrelateQueryValidation;

	const result = await correlateSessionLogsUseCase(params.id_session, {
		logql: query.logql,
		limit: query.limit,
		userId: req.userId,
		userLevel: req.userData?.level
	});
	return { result };
};

export default {
	health,
	listDatasources,
	correlateSession
};
