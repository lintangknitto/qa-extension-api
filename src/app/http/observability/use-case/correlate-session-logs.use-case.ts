import { findSessionById } from '@/app/http/session/queries/session.queries';
import { assertSessionExists, assertCanAccessSession } from '@/app/http/session/domain/session.domain';
import { listEventsBySession } from '@/app/http/recording/queries/recording-event.queries';
import grafanaService, { ILokiLogEntry } from '../services/grafana.service';
import { searchCodebaseChunksByVector } from '@/app/http/codebase-memory/queries/codebase.queries';
import embeddingService from '@/libs/services/embedding.service';

export interface ICorrelateSessionResult {
	session: {
		id_session: number;
		id_project: number | null;
		title: string;
		started_at: string | null;
		ended_at: string | null;
		target_url: string | null;
	};
	recording_errors: Array<{
		sequence: number;
		event_type: string;
		url?: string;
		status_code?: number;
		error_detail?: string;
	}>;
	grafana_logs: ILokiLogEntry[];
	matched_code_context: Array<{
		file_path: string;
		start_line: number;
		end_line: number;
		similarity: number;
		content: string;
	}>;
}

const parseEventPayload = (rawPayload: unknown): Record<string, unknown> => {
	if (typeof rawPayload === 'string') {
		try {
			return JSON.parse(rawPayload) as Record<string, unknown>;
		} catch {
			return {};
		}
	}
	if (typeof rawPayload === 'object' && rawPayload !== null) {
		return rawPayload as Record<string, unknown>;
	}
	return {};
};

const getErrorDetail = (payload: Record<string, unknown>): string => {
	if (typeof payload.error === 'string') return payload.error;
	if (typeof payload.message === 'string') return payload.message;
	if (typeof payload.statusText === 'string') return payload.statusText;
	return '';
};

const getEventUrl = (evUrl?: string | null, payloadUrl?: unknown): string | undefined => {
	if (evUrl) return evUrl;
	if (typeof payloadUrl === 'string') return payloadUrl;
	return undefined;
};

const extractErrorsFromEvents = (
	events: Array<Entity.IQaRecordingEvent>
): {
	recordingErrors: ICorrelateSessionResult['recording_errors'];
	searchKeywords: string[];
} => {
	const recordingErrors: ICorrelateSessionResult['recording_errors'] = [];
	const searchKeywords: string[] = [];

	for (const ev of events) {
		const payload = parseEventPayload(ev.payload);
		const eventType = String(ev.event_type || '');
		const statusCode = typeof payload.status === 'number'
			? payload.status
			: typeof payload.statusCode === 'number'
				? payload.statusCode
				: 0;

		const isError = eventType.includes('error') || (statusCode >= 400 && statusCode <= 599);
		if (!isError) continue;

		const errorDetail = getErrorDetail(payload);
		const eventUrl = getEventUrl(ev.url, payload.url);

		recordingErrors.push({
			sequence: Number(ev.sequence),
			event_type: eventType,
			url: eventUrl,
			status_code: statusCode > 0 ? statusCode : undefined,
			error_detail: errorDetail || undefined
		});

		if (errorDetail) searchKeywords.push(errorDetail);
		if (eventUrl) {
			try {
				const parsed = new URL(eventUrl);
				searchKeywords.push(parsed.pathname);
			} catch {
				searchKeywords.push(eventUrl);
			}
		}
	}

	return { recordingErrors, searchKeywords };
};

export const findMatchingCodeContext = async (
	idProject: number,
	keywords: string[]
): Promise<ICorrelateSessionResult['matched_code_context']> => {
	if (keywords.length === 0) return [];

	const combinedQuery = keywords.slice(0, 3).join(' ');
	try {
		const queryVector = await embeddingService.generateEmbedding(combinedQuery);
		const vectorStr = embeddingService.formatVectorForPg(queryVector);
		const chunks = await searchCodebaseChunksByVector(idProject, vectorStr, 3, 0.3);

		return chunks.map((chunk) => ({
			file_path: chunk.file_path,
			start_line: chunk.start_line,
			end_line: chunk.end_line,
			similarity: Number(chunk.similarity.toFixed(4)),
			content: chunk.content
		}));
	} catch {
		return [];
	}
};

const resolveSessionTimeRange = (
	session: Entity.IQaRecordingSession
): { fromMs: number; toMs: number } => {
	const startedAt = session.started_at ? new Date(session.started_at) : new Date();
	const endedAt = session.ended_at ? new Date(session.ended_at) : new Date(startedAt.getTime() + 15 * 60 * 1000);
	return {
		fromMs: startedAt.getTime() - 60 * 1000,
		toMs: endedAt.getTime() + 60 * 1000
	};
};

const fetchLokiLogs = async (
	fromMs: number,
	toMs: number,
	logql?: string,
	limit?: number
): Promise<ILokiLogEntry[]> => {
	try {
		const query = logql || '{app=~".+"} |= "error"';
		return await grafanaService.queryLokiLogs(query, fromMs, toMs, limit || 30);
	} catch {
		return [];
	}
};

export const correlateSessionLogsUseCase = async (
	idSession: number,
	options?: {
		logql?: string;
		limit?: number;
		userId?: number;
		userLevel?: string;
	}
): Promise<ICorrelateSessionResult> => {
	const session = await findSessionById(idSession);
	assertSessionExists(session);

	if (options?.userId) {
		assertCanAccessSession(session, options.userId, options.userLevel, ['SUPERADMIN', 'ADMIN']);
	}

	const { fromMs, toMs } = resolveSessionTimeRange(session);
	const events = await listEventsBySession(idSession, 0, 500);
	const { recordingErrors, searchKeywords } = extractErrorsFromEvents(events);
	const grafanaLogs = await fetchLokiLogs(fromMs, toMs, options?.logql, options?.limit);

	const searchTerms = [
		...searchKeywords,
		...grafanaLogs.slice(0, 3).map((l) => l.line.slice(0, 150))
	].filter(Boolean);

	const matchedCodeContext = session.id_project
		? await findMatchingCodeContext(Number(session.id_project), searchTerms)
		: [];

	return {
		session: {
			id_session: Number(session.id_session),
			id_project: session.id_project ? Number(session.id_project) : null,
			title: String(session.title || ''),
			started_at: session.started_at || null,
			ended_at: session.ended_at || null,
			target_url: session.target_url || null
		},
		recording_errors: recordingErrors,
		grafana_logs: grafanaLogs,
		matched_code_context: matchedCodeContext
	};
};
