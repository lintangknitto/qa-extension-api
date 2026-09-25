/* eslint-disable complexity */
import { NotFoundException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import * as sessionQueries from '../queries/session.queries';
import * as sessionDomain from '../domain/session.domain';
import { listCheckpointsBySession } from '../queries/session.queries';
import { listEventsBySession } from '../../recording/queries/recording-event.queries';
import { listGenerations } from '../../recording/queries/generation.queries';
import { findProjectById } from '../../project/queries/project.queries';

export interface INetworkRequestSummary {
	sequence: number;
	method: string;
	url: string;
	status: number;
	status_text?: string;
	duration_ms?: number;
	request_body?: unknown;
	response_body?: unknown;
	is_error: boolean;
}

export interface IConsoleLogSummary {
	sequence: number;
	type: 'error' | 'warning' | 'log' | 'info';
	message: string;
	timestamp?: string;
}

export interface IUserActionSummary {
	sequence: number;
	action_type: string;
	target_selector?: string;
	value?: string;
	url?: string;
	timestamp?: string;
}

export const getShareContextUseCase = async (shareToken: string) => {
	const session = await sessionQueries.findSessionByShareToken(shareToken);
	if (!session) {
		throw new NotFoundException('Sesi rekaman dengan share token ini tidak ditemukan.');
	}

	const idSession = Number(session.id_session);

	// Load related data concurrently
	const [checkpoints, rawEvents, generations, project] = await Promise.all([
		listCheckpointsBySession(idSession),
		listEventsBySession(idSession, 0, 1500),
		listGenerations(idSession),
		session.id_project ? findProjectById(Number(session.id_project)) : Promise.resolve(null)
	]);

	const networkRequests: INetworkRequestSummary[] = [];
	const consoleLogs: IConsoleLogSummary[] = [];
	const userActions: IUserActionSummary[] = [];
	const failedRequests: INetworkRequestSummary[] = [];

	for (const event of rawEvents) {
		let payload: any = {};
		if (event.payload) {
			try {
				payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
			} catch {
				payload = { raw: event.payload };
			}
		}

		const eventType = String(event.event_type || '').toLowerCase();
		const seq = Number(event.sequence || 0);

		if (eventType.includes('network') || payload?.type === 'network' || payload?.url || payload?.status) {
			const statusCode = Number(payload.status || payload.statusCode || 200);
			const isError = statusCode >= 400 || Boolean(payload.error);
			const item: INetworkRequestSummary = {
				sequence: seq,
				method: String(payload.method || 'GET').toUpperCase(),
				url: String(payload.url || event.url || '-'),
				status: statusCode,
				status_text: payload.statusText,
				duration_ms: payload.duration ? Number(payload.duration) : undefined,
				request_body: payload.requestBody || payload.body,
				response_body: payload.responseBody || payload.response,
				is_error: isError
			};
			networkRequests.push(item);
			if (isError) {
				failedRequests.push(item);
			}
		} else if (eventType.includes('console') || eventType.includes('error') || payload.level === 'error') {
			consoleLogs.push({
				sequence: seq,
				type: (payload.level || 'error'),
				message: String(payload.text || payload.message || JSON.stringify(payload)),
				timestamp: event.occurred_at || event.created_at
			});
		} else if (
			eventType.includes('click') ||
			eventType.includes('input') ||
			eventType.includes('change') ||
			eventType.includes('nav') ||
			eventType.includes('dom')
		) {
			userActions.push({
				sequence: seq,
				action_type: eventType,
				target_selector: payload.selector || payload.target,
				value: payload.value,
				url: event.url || payload.url,
				timestamp: event.occurred_at || event.created_at
			});
		}
	}

	const playwrightGen = generations.find((g) => g.kind === 'playwright');

	return {
		session: {
			...sessionDomain.toSessionResponse(session),
			project_name: project?.name || null,
			project_code: project?.code || null
		},
		checkpoints: checkpoints.map(sessionDomain.toCheckpointResponse),
		playwright_script: playwrightGen?.output || null,
		failed_requests: failedRequests,
		network_requests: networkRequests,
		console_logs: consoleLogs,
		user_actions: userActions,
		counts: {
			total_events: rawEvents.length,
			total_checkpoints: checkpoints.length,
			total_network_requests: networkRequests.length,
			total_failed_requests: failedRequests.length,
			total_console_errors: consoleLogs.length
		}
	};
};
