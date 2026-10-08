import { logger } from '@knittotextile/knitto-core-backend';
import { openAiConfig, PROJECT_ADMIN_LEVELS } from '@/libs/config';
import { createOpenAiCompleter, type IAiCompleter } from '@/libs/config/openaiClient';
import grafanaService, { type GrafanaService } from '@/app/http/observability/services/grafana.service';
import { findMatchingCodeContext } from '@/app/http/observability/use-case/correlate-session-logs.use-case';
import {
	buildFilteredDashboardUrl,
	effectiveVariables,
	extractLokiTargets,
	parseDashboardUrl,
	renderLogql
} from '@/app/http/observability/domain/dashboard-query';
import { listProgramsForProject } from '@/app/http/program/queries/program.queries';
import * as sessionQueries from '../../session/queries/session.queries';
import * as sessionDomain from '../../session/domain/session.domain';
import * as generationRepo from '../repo/generation.repo';
import { buildSystemPrompt, GENERATION_PROMPT_VERSION } from '../domain/ai-generation';
import {
	collectFailureSignals,
	lastActionsBefore,
	prioritizeSignals,
	programsForSignal,
	searchTermsFor,
	surroundingLines,
	timeWindowFor,
	type FailureSignal,
	type LogLine
} from '../domain/investigation-context';
import { redactLogText } from '../domain/redaction';
import type { IAiInputEvent } from '../domain/ai-input';
import { loadSessionEvents } from './load-session-events';
import { emitGenerationStarted, emitGenerationCompleted, emitGenerationFailed } from '@/app/ws';

const LOG_HITS_LIMIT = 20;
const CONTEXT_HITS = 2;
const CONTEXT_WINDOW_MS = 2000;
const MAX_LINE_CHARS = 400;
/** Batas panel Loki per dashboard agar jumlah query tetap terkendali. */
const MAX_LOKI_PANELS = 3;
/** Filter level error untuk sinyal tanpa kata kunci (requestId/path). */
const ERROR_LINE_FILTER = '|~ "(?i)(error|exception|fatal|panic)"';

export interface LogEvidence {
	signal: FailureSignal | null;
	program: string;
	logql: string;
	dashboardLink: string;
	hits: number;
	/** true bila query tanpa kata kunci sinyal (hanya filter level error) — hasilnya belum tentu terkait. */
	unfiltered?: boolean;
	snippets: string[][];
	error?: string;
}

type GrafanaPort = Pick<GrafanaService, 'getDashboard' | 'queryLokiLogs'>;

export interface InvestigationDeps {
	grafana?: GrafanaPort;
	completer?: IAiCompleter;
	listPrograms?: (idProject: number) => Promise<Entity.IQaProgram[]>;
	findCodeContext?: typeof findMatchingCodeContext;
}

// Log server bisa memuat token/kredensial: redaksi sebelum ke AI, penyimpanan, dan share page.
const formatLine = (entry: LogLine): string => redactLogText(`${entry.timestamp} ${entry.line.slice(0, MAX_LINE_CHARS)}`);
const lineKey = (entry: LogLine): string => `${entry.timestampNs ?? entry.timestamp}\u0000${entry.line}`;

/**
 * Query Loki untuk satu (sinyal, program) memakai query panel dashboard program:
 * hit berdasarkan requestId/path, lalu baris di sekitar hit untuk log multiline.
 * Sinyal tanpa kata kunci (console error, request tanpa requestId/path) hanya
 * mengambil baris berlevel error dan ditandai `unfiltered` — bukan "baris cocok".
 * `seenLines` dibagi lintas pemanggilan agar cuplikan yang tumpang tindih tidak berulang.
 */
const collectEvidence = async (
	grafana: GrafanaPort,
	program: Entity.IQaProgram,
	signal: FailureSignal | null,
	session: Entity.IQaRecordingSession,
	dashboardCache: Map<string, Promise<Record<string, unknown>>>,
	seenLines: Set<string>
): Promise<LogEvidence[]> => {
	const ref = parseDashboardUrl(program.grafana_dashboard_url);
	const programName = String(program.code ?? program.name ?? program.id_program);
	if (!ref || !program.grafana_dashboard_url) return [];

	const terms = signal ? searchTermsFor(signal) : [];
	const unfiltered = terms.length === 0;
	const { fromMs, toMs } = timeWindowFor(signal, session);
	try {
		let pending = dashboardCache.get(ref.uid);
		if (!pending) {
			pending = grafana.getDashboard(ref.uid);
			dashboardCache.set(ref.uid, pending);
		}
		const dashboard = await pending;
		const vars = effectiveVariables(dashboard, ref.vars);
		const dashboardLink = buildFilteredDashboardUrl(program.grafana_dashboard_url, dashboard, terms, { fromMs, toMs });
		const evidence: LogEvidence[] = [];

		for (const target of extractLokiTargets(dashboard, vars).slice(0, MAX_LOKI_PANELS)) {
			const baseQuery = renderLogql(dashboard, target.expr, vars, []);
			const logql = unfiltered ? `${baseQuery} ${ERROR_LINE_FILTER}` : renderLogql(dashboard, target.expr, vars, terms);
			const hits = await grafana.queryLokiLogs(logql, fromMs, toMs, LOG_HITS_LIMIT, target.datasourceUid);
			const windows = await Promise.all(
				hits.slice(0, CONTEXT_HITS).map(async (hit) => {
					const hitMs = Date.parse(hit.timestamp);
					const around = await grafana.queryLokiLogs(baseQuery, hitMs - CONTEXT_WINDOW_MS, hitMs + CONTEXT_WINDOW_MS, 200, target.datasourceUid);
					return surroundingLines(around.length > 0 ? around : [hit], hit);
				})
			);
			const snippets: string[][] = [];
			for (const window of windows) {
				const fresh = window.filter((entry) => !seenLines.has(lineKey(entry)));
				fresh.forEach((entry) => seenLines.add(lineKey(entry)));
				if (fresh.length > 0) snippets.push(fresh.map(formatLine));
			}
			evidence.push({ signal, program: programName, logql, dashboardLink, hits: hits.length, unfiltered, snippets });
		}
		return evidence;
	} catch (error) {
		return [{ signal, program: programName, logql: '', dashboardLink: program.grafana_dashboard_url, hits: 0, unfiltered, snippets: [], error: (error as Error).message }];
	}
};

export const buildInvestigationContext = (
	session: Entity.IQaRecordingSession,
	events: IAiInputEvent[],
	signals: FailureSignal[],
	evidence: LogEvidence[],
	codeContext: Array<{ file_path: string; start_line: number; end_line: number; content: string }>
): string => {
	const lines: string[] = [
		'## Sesi',
		`Test case: ${[session.test_case_no, session.title].filter(Boolean).join(' ') || '-'}`,
		`Hasil tester: ${session.result ?? '-'}`,
		`Actual result: ${session.actual_result ?? '-'}`,
		`Target URL: ${session.target_url ?? '-'}`,
		'',
		'## Sinyal kegagalan dari rekaman'
	];
	if (signals.length === 0) lines.push('(tidak ada request gagal/console error/replay gagal yang terekam)');
	for (const signal of signals) {
		lines.push(`- #${signal.sequence} ${signal.summary}`);
		for (const action of lastActionsBefore(events, signal.sequence)) lines.push(`  - langkah sebelumnya: ${action}`);
	}

	lines.push('', '## Log server (Loki, dari dashboard program)');
	if (evidence.length === 0) lines.push('(program project ini belum punya dashboard Grafana)');
	for (const item of evidence) {
		const about = item.signal ? `#${item.signal.sequence}` : 'rentang sesi';
		if (item.error) {
			lines.push(`- [${item.program}] ${about}: gagal query log — ${item.error}`);
			continue;
		}
		lines.push(`- [${item.program}] ${about}: ${item.hits} ${item.unfiltered ? 'baris error (tanpa kata kunci spesifik, belum tentu terkait)' : 'baris cocok'} — LogQL: ${item.logql}`);
		item.snippets.forEach((snippet, index) => {
			lines.push(`  Cuplikan ${index + 1}:`, '  ```', ...snippet.map((line) => `  ${line}`), '  ```');
		});
	}

	lines.push('', '## Konteks kode (codebase memory)');
	if (codeContext.length === 0) lines.push('(tidak ada potongan kode yang relevan)');
	for (const chunk of codeContext) {
		lines.push(`- ${chunk.file_path}:${chunk.start_line}-${chunk.end_line}`, '  ```', ...chunk.content.slice(0, 1200).split('\n').map((l) => `  ${l}`), '  ```');
	}
	return lines.join('\n');
};

/** Bagian bukti deterministik (tidak bergantung AI): link dashboard terfilter + LogQL. */
export const renderEvidenceAppendix = (evidence: LogEvidence[]): string => {
	if (evidence.length === 0) return '';
	const rows = evidence.map((item) => {
		const about = item.signal ? `#${item.signal.sequence} ${item.signal.summary}` : 'rentang sesi';
		const status = item.error ? `gagal query: ${item.error}` : `${item.hits} baris log${item.unfiltered ? ' (tidak terfilter kata kunci)' : ''}`;
		return `- **${item.program}** — ${about} — ${status} — [buka dashboard](${item.dashboardLink})${item.logql ? `\n  \`${item.logql}\`` : ''}`;
	});
	return ['', '---', '## Bukti & tautan dashboard', ...rows].join('\n');
};

export const runInvestigation = async (
	session: Entity.IQaRecordingSession,
	events: IAiInputEvent[],
	deps: InvestigationDeps = {}
): Promise<string> => {
	const grafana = deps.grafana ?? grafanaService;
	const listPrograms = deps.listPrograms ?? listProgramsForProject;
	const findCodeContext = deps.findCodeContext ?? findMatchingCodeContext;
	const completer = deps.completer ?? createOpenAiCompleter();

	const signals = prioritizeSignals(collectFailureSignals(events));
	const programs = session.id_project ? await listPrograms(Number(session.id_project)) : [];
	const dashboardCache = new Map<string, Promise<Record<string, unknown>>>();
	const seenLines = new Set<string>();

	const evidence: LogEvidence[] = [];
	const targets: Array<FailureSignal | null> = signals.length > 0 ? signals : [null];
	for (const signal of targets) {
		const relevant = signal ? programsForSignal(programs, signal) : programs.filter((p) => p.grafana_dashboard_url);
		for (const program of relevant) evidence.push(...(await collectEvidence(grafana, program, signal, session, dashboardCache, seenLines)));
	}

	const searchTerms = [
		...signals.map((signal) => signal.summary),
		...evidence.flatMap((item) => item.snippets.flat()).slice(0, 3)
	].filter(Boolean);
	const codeContext = session.id_project ? await findCodeContext(Number(session.id_project), searchTerms) : [];

	const context = buildInvestigationContext(session, events, signals, evidence, codeContext);
	const report = (await completer.complete({ system: buildSystemPrompt('investigation'), user: context })).trim();
	if (!report) throw new Error('Provider AI mengembalikan laporan investigasi kosong.');
	return `${report}${renderEvidenceAppendix(evidence)}`;
};

/** Menjalankan investigasi lalu menyimpannya sebagai generation kind `investigation`. */
export const investigateSessionUseCase = async (
	ctx: { idSession: number; userId: number; userLevel: string | undefined },
	deps: InvestigationDeps = {}
): Promise<{ status: 'completed' | 'failed'; output?: string; error?: string }> => {
	const session = sessionDomain.assertSessionExists(await sessionQueries.findSessionById(ctx.idSession));
	sessionDomain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);
	const { events } = await loadSessionEvents(ctx.idSession);
	return persistInvestigation(session, events, deps);
};

/** Sesi yang investigasinya sedang berjalan di proses ini — mencegah investigasi ganda (AI + Loki) untuk sesi yang sama. */
const inFlightInvestigations = new Set<number>();

export type BackgroundRunner = (task: () => Promise<unknown>) => void;

/**
 * Jalankan investigasi di background (hasil lewat WS `generation:*`) agar request
 * pemicu (End Session, laporan replay gagal) tidak menunggu Loki + AI.
 * Mengembalikan `already_running` bila sesi itu masih diinvestigasi.
 */
export const startInvestigationInBackground = (
	session: Entity.IQaRecordingSession,
	loadEvents: () => Promise<IAiInputEvent[]>,
	deps: InvestigationDeps & { runInBackground?: BackgroundRunner } = {}
): 'started' | 'already_running' => {
	const idSession = Number(session.id_session);
	if (inFlightInvestigations.has(idSession)) return 'already_running';
	inFlightInvestigations.add(idSession);
	const run = deps.runInBackground ?? ((task) => void task());
	run(async () => {
		try {
			await persistInvestigation(session, await loadEvents(), deps);
		} catch (error) {
			// persistInvestigation sudah menangkap kegagalan AI/Loki; yang sampai sini mis. gagal memuat event/DB.
			logger.error({ err: error, idSession }, 'Investigasi background gagal');
		} finally {
			inFlightInvestigations.delete(idSession);
		}
	});
	return 'started';
};

export const persistInvestigation = async (
	session: Entity.IQaRecordingSession,
	events: IAiInputEvent[],
	deps: InvestigationDeps = {}
): Promise<{ status: 'completed' | 'failed'; output?: string; error?: string }> => {
	const idSession = Number(session.id_session);
	const idGeneration = await generationRepo.startGeneration({
		idSession,
		kind: 'investigation',
		model: openAiConfig.MODEL,
		promptVersion: GENERATION_PROMPT_VERSION
	});
	emitGenerationStarted(idSession, 'investigation');
	try {
		const output = await runInvestigation(session, events, deps);
		await generationRepo.markGenerationCompleted(idGeneration, output);
		emitGenerationCompleted(idSession, 'investigation', output);
		return { status: 'completed', output };
	} catch (error) {
		const message = (error as Error).message;
		await generationRepo.markGenerationFailed(idGeneration, message);
		emitGenerationFailed(idSession, 'investigation', message);
		return { status: 'failed', error: message };
	}
};
