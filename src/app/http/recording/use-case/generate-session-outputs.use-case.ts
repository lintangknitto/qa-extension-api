import { openAiConfig, PROJECT_ADMIN_LEVELS } from '@/libs/config';
import { createOpenAiCompleter, type IAiCompleter } from '@/libs/config/openaiClient';
import {
	buildSystemPrompt,
	normalizeAiOutput,
	assertGenerationKind,
	DEFAULT_GENERATION_KINDS,
	GENERATION_PROMPT_VERSION,
	toGenerationResponse,
	type TGenerationKind
} from '../domain/ai-generation';
import { buildAiSessionContext } from '../domain/ai-input';
import { loadSessionEvents } from './load-session-events';
import { startInvestigationInBackground, type BackgroundRunner } from './investigate-session.use-case';
import { collectFailureSignals, shouldAutoInvestigate } from '../domain/investigation-context';
import { generatePlaywrightScript, CODEGEN_MODEL, CODEGEN_VERSION } from '../domain/playwright-codegen';
import { listTestDataFiles } from './test-data-files.use-case';
import * as artifactQueries from '../queries/artifact.queries';
import { buildPatchUserPrompt, parsePatchResponse, renderPatchedScript, validatePatches } from '../domain/ai-patch';
import * as generationQueries from '../queries/generation.queries';
import * as generationRepo from '../repo/generation.repo';
import * as sessionQueries from '../../session/queries/session.queries';
import * as sessionDomain from '../../session/domain/session.domain';
import { emitGenerationStarted, emitGenerationCompleted, emitGenerationFailed } from '@/app/ws';

export interface IGenerationRunResult {
	/** `started`/`already_running`: investigasi berjalan di background, hasil lewat WS `generation:*`. */
	status: 'completed' | 'failed' | 'started' | 'already_running';
	output?: string;
	error?: string;
}

export const generateSessionOutputsUseCase = async (ctx: {
	idSession: number;
	userId: number;
	userLevel: string | undefined;
	kinds?: string[];
	completer?: IAiCompleter;
	runInBackground?: BackgroundRunner;
}): Promise<{ results: Record<string, IGenerationRunResult> }> => {
	const session = sessionDomain.assertSessionExists(await sessionQueries.findSessionById(ctx.idSession));
	sessionDomain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);

	const explicitKinds = ctx.kinds && ctx.kinds.length > 0;
	const kinds: TGenerationKind[] = explicitKinds
		? (ctx.kinds ?? []).map((kind) => assertGenerationKind(kind))
		: [...DEFAULT_GENERATION_KINDS];

	const { actionEvents, events } = await loadSessionEvents(ctx.idSession);
	// Investigasi otomatis saat sesi FAIL/BLOCKED atau ada request gagal/console error/replay gagal.
	if (!explicitKinds && shouldAutoInvestigate(session.result, collectFailureSignals(events))) kinds.push('investigation');
	const checkpoints = await sessionQueries.listCheckpointsBySession(ctx.idSession);
	const sessionInfo = {
		test_case_no: session.test_case_no,
		title: session.title,
		description: session.description,
		target_url: session.target_url,
		result: session.result,
		actual_result: session.actual_result
	};

	const context = buildAiSessionContext({ session: sessionInfo, events, checkpoints });
	const testDataFiles = listTestDataFiles(await artifactQueries.listArtifactsBySession(ctx.idSession));
	const codegen = generatePlaywrightScript({ session: sessionInfo, events: actionEvents, checkpoints, testDataFiles });

	const runKind = async (kind: TGenerationKind, completer: IAiCompleter): Promise<string> => {
		if (kind === 'playwright') return codegen.script;
		if (kind === 'playwright_ai') {
			// AI hanya mengusulkan patch value/komentar; struktur langkah dikunci oleh validator.
			const raw = await completer.complete({ system: buildSystemPrompt(kind), user: buildPatchUserPrompt(sessionInfo, codegen.steps) });
			const result = validatePatches(codegen.steps, parsePatchResponse(raw));
			return renderPatchedScript(sessionInfo, codegen.steps, result);
		}
		return normalizeAiOutput(kind, await completer.complete({ system: buildSystemPrompt(kind), user: context }));
	};

	const completer = ctx.completer ?? createOpenAiCompleter();
	const results: Record<string, IGenerationRunResult> = {};

	await Promise.all(
		kinds.map(async (kind) => {
			if (kind === 'investigation') {
				// Investigasi punya alur sendiri (Loki + codebase memory) dan berjalan di background:
				// End Session tidak menunggu Loki + AI; markdown/playwright tetap dikembalikan langsung.
				results[kind] = { status: startInvestigationInBackground(session, async () => events, { completer, runInBackground: ctx.runInBackground }) };
				return;
			}
			// Script Playwright dibuat deterministik dari event (tanpa AI) supaya 1:1 dengan rekaman.
			const isCodegen = kind === 'playwright';
			const idGeneration = await generationRepo.startGeneration({
				idSession: ctx.idSession,
				kind,
				model: isCodegen ? CODEGEN_MODEL : openAiConfig.MODEL,
				promptVersion: isCodegen ? CODEGEN_VERSION : GENERATION_PROMPT_VERSION
			});
			emitGenerationStarted(ctx.idSession, kind);

			try {
				const output = await runKind(kind, completer);
				await generationRepo.markGenerationCompleted(idGeneration, output);
				emitGenerationCompleted(ctx.idSession, kind, output);
				results[kind] = { status: 'completed', output };
			} catch (error) {
				// Session tetap selesai meski AI gagal; retry dilakukan lewat endpoint yang sama.
				await generationRepo.markGenerationFailed(idGeneration, (error as Error).message);
				emitGenerationFailed(ctx.idSession, kind, (error as Error).message);
				results[kind] = { status: 'failed', error: (error as Error).message };
			}
		})
	);

	return { results };
};

export const listGenerationsUseCase = async (ctx: {
	idSession: number;
	userId: number;
	userLevel: string | undefined;
}) => {
	const session = sessionDomain.assertSessionExists(await sessionQueries.findSessionById(ctx.idSession));
	sessionDomain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);

	const generations = await generationQueries.listGenerations(ctx.idSession);
	return { items: generations.map((generation) => toGenerationResponse(generation)) };
};
