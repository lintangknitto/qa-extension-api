import type { IAiInputEvent } from './ai-input';
import { compareNs } from '@/app/http/observability/services/grafana.service';
import { redactLogText, redactUrl } from './redaction';

/**
 * Sinyal kegagalan dari rekaman yang memicu & mengarahkan investigasi:
 * request gagal (4xx/5xx/failed), console error/exception, dan laporan replay gagal.
 */
export interface FailureSignal {
	kind: 'network' | 'console' | 'replay';
	sequence: number;
	occurredAtMs: number | null;
	summary: string;
	method?: string;
	requestUrl?: string;
	status?: number;
	requestId?: string;
	pageUrl?: string;
}

export const REPLAY_FAILURE_EVENT_TYPE = 'replay_failure';
export const INVESTIGATION_WINDOW_MS = 2 * 60 * 1000;
export const MAX_INVESTIGATED_SIGNALS = 5;

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const toMs = (iso?: string | null): number | null => {
	if (!iso) return null;
	const ms = Date.parse(iso);
	return Number.isNaN(ms) ? null : ms;
};

const networkSignal = (event: IAiInputEvent): FailureSignal | null => {
	const payload = event.payload;
	const status = Number(payload.status ?? 0);
	if (status < 400 && payload.failed !== true) return null;
	const method = asString(payload.method) || 'GET';
	const requestUrl = event.url ?? asString(payload.url);
	const requestId = asString(payload.request_id) || undefined;
	return {
		kind: 'network',
		sequence: event.sequence,
		occurredAtMs: toMs(event.occurredAt),
		summary: `${method} ${status || 'FAILED'} ${requestUrl ? redactUrl(requestUrl) : ''}${requestId ? ` (requestId ${requestId})` : ''}`,
		method,
		requestUrl,
		status: status || undefined,
		requestId
	};
};

const consoleSignal = (event: IAiInputEvent): FailureSignal | null => {
	const payload = event.payload;
	const level = asString(payload.level) || (event.type === 'exception' ? 'error' : 'log');
	if (level !== 'error' && event.type !== 'exception') return null;
	// Teks console berasal dari halaman (tidak tepercaya): redaksi sebelum ke AI/penyimpanan.
	const text = redactLogText((asString(payload.text) || asString(payload.message)).slice(0, 300));
	return { kind: 'console', sequence: event.sequence, occurredAtMs: toMs(event.occurredAt), summary: `[${level}] ${text}`, pageUrl: event.url ?? undefined };
};

const replaySignal = (event: IAiInputEvent): FailureSignal => {
	const payload = event.payload;
	const stepNo = Number(payload.step_no ?? 0);
	const error = redactLogText(asString(payload.error).slice(0, 300));
	const step = redactLogText(asString(payload.step_description) || asString(payload.selector));
	return {
		kind: 'replay',
		sequence: event.sequence,
		occurredAtMs: toMs(event.occurredAt),
		summary: `Replay gagal di langkah ${stepNo || '?'}${step ? ` (${step})` : ''}: ${error}`
	};
};

const SIGNAL_EXTRACTORS: Record<string, (event: IAiInputEvent) => FailureSignal | null> = {
	network: networkSignal,
	console: consoleSignal,
	exception: consoleSignal,
	[REPLAY_FAILURE_EVENT_TYPE]: replaySignal
};

export const collectFailureSignals = (events: IAiInputEvent[]): FailureSignal[] =>
	events.map((event) => SIGNAL_EXTRACTORS[event.type]?.(event) ?? null).filter((signal): signal is FailureSignal => signal !== null);

/** Sinyal yang cukup serius untuk menginvestigasi sesi PASS: 5xx/request gagal atau replay gagal (bukan 4xx/console biasa). */
const isSevere = (signal: FailureSignal): boolean =>
	signal.kind === 'replay' || (signal.kind === 'network' && (signal.status === undefined || signal.status >= 500));

/** Investigasi otomatis: hasil FAIL/BLOCKED, atau sesi PASS dengan sinyal serius. */
export const shouldAutoInvestigate = (result: string | null | undefined, signals: FailureSignal[]): boolean =>
	result === 'FAIL' || result === 'BLOCKED' || signals.some(isSevere);

/** Sinyal paling informatif lebih dulu: request dengan requestId, request gagal, replay, console. */
export const prioritizeSignals = (signals: FailureSignal[]): FailureSignal[] => {
	const rank = (s: FailureSignal) => (s.requestId ? 0 : s.kind === 'network' ? (s.status && s.status >= 500 ? 1 : 2) : s.kind === 'replay' ? 3 : 4);
	return [...signals].sort((a, b) => rank(a) - rank(b) || a.sequence - b.sequence).slice(0, MAX_INVESTIGATED_SIGNALS);
};

const pathOf = (url?: string): string | undefined => {
	if (!url) return undefined;
	try {
		return new URL(url).pathname;
	} catch {
		return undefined;
	}
};

const hostOf = (url?: string | null): string | undefined => {
	if (!url) return undefined;
	try {
		return new URL(url).host.toLowerCase();
	} catch {
		return undefined;
	}
};

/** Kata kunci pencarian log: requestId (paling presisi), lalu path endpoint. */
export const searchTermsFor = (signal: FailureSignal): string[] => {
	if (signal.requestId) return [signal.requestId];
	const path = pathOf(signal.requestUrl);
	if (path && path !== '/') return [path];
	return [];
};

/**
 * Program yang lognya relevan untuk sinyal: request → program yang `base_url`-nya
 * se-host dengan URL request; selain itu (atau tidak ada yang cocok) → semua program
 * project yang punya dashboard.
 */
export const programsForSignal = <P extends { base_url?: string | null; grafana_dashboard_url?: string | null }>(
	programs: P[],
	signal: FailureSignal
): P[] => {
	const withDashboard = programs.filter((program) => Boolean(program.grafana_dashboard_url));
	const host = hostOf(signal.requestUrl ?? signal.pageUrl);
	if (host) {
		const matched = withDashboard.filter((program) => hostOf(program.base_url) === host);
		if (matched.length > 0) return matched;
	}
	return withDashboard;
};

export const timeWindowFor = (
	signal: FailureSignal | null,
	session: { started_at?: string | null; ended_at?: string | null }
): { fromMs: number; toMs: number } => {
	if (signal?.occurredAtMs) return { fromMs: signal.occurredAtMs - INVESTIGATION_WINDOW_MS, toMs: signal.occurredAtMs + INVESTIGATION_WINDOW_MS };
	const start = toMs(session.started_at) ?? Date.now() - 15 * 60 * 1000;
	const end = toMs(session.ended_at) ?? start + 15 * 60 * 1000;
	return { fromMs: start - 60 * 1000, toMs: end + 60 * 1000 };
};

/** Langkah tester terakhir sebelum sinyal, untuk konteks "apa yang sedang dilakukan". */
export const lastActionsBefore = (events: IAiInputEvent[], sequence: number, count = 3): string[] =>
	events
		.filter((event) => event.type === 'action' && event.sequence < sequence)
		.slice(-count)
		.map((event) => {
			const payload = event.payload;
			const action = asString(payload.action) || 'action';
			const locator =
				asString(payload.unique_locator) ||
				(Array.isArray(payload.locators) ? asString(payload.locators[0]) : '') ||
				asString(payload.url);
			const value = payload.value_redacted === true ? ' [REDACTED]' : typeof payload.value === 'string' ? ` "${redactLogText(payload.value.slice(0, 80))}"` : '';
			return `#${event.sequence} ${action} ${locator}${value}`.trim();
		});

export interface LogLine {
	timestamp: string;
	timestampNs?: string;
	line: string;
}

/**
 * Log multiline di Loki tersimpan per baris: ambil baris di sekitar hit
 * (urut waktu naik) agar objek log utuh ikut terbaca.
 */
export const surroundingLines = (window: LogLine[], hit: LogLine, radius = 10): LogLine[] => {
	const sorted = [...window].sort((a, b) => compareNs(a.timestampNs, b.timestampNs) || a.timestamp.localeCompare(b.timestamp));
	const index = sorted.findIndex((line) => (line.timestampNs ?? line.timestamp) === (hit.timestampNs ?? hit.timestamp) && line.line === hit.line);
	if (index === -1) return [hit];
	return sorted.slice(Math.max(0, index - radius), index + radius + 1);
};
