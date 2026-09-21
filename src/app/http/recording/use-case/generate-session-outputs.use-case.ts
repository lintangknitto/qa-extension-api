import { openAiConfig, PROJECT_ADMIN_LEVELS } from '@/libs/config';
import { createOpenAiCompleter, type IAiCompleter } from '@/libs/config/openaiClient';
import {
	buildSystemPrompt,
	normalizeAiOutput,
	assertGenerationKind,
	GENERATION_KINDS,
	GENERATION_PROMPT_VERSION,
	toGenerationResponse,
	type TGenerationKind
} from '../domain/ai-generation';
import { buildAiSessionContext, parseStoredEvent } from '../domain/ai-input';
import * as eventQueries from '../queries/recording-event.queries';
import * as generationQueries from '../queries/generation.queries';
import * as generationRepo from '../repo/generation.repo';
import * as sessionQueries from '../../session/queries/session.queries';
import * as sessionDomain from '../../session/domain/session.domain';

export interface IGenerationRunResult {
	status: 'completed' | 'failed';
	output?: string;
	error?: string;
}

export const generateSessionOutputsUseCase = async (ctx: {
	idSession: number;
	userId: number;
	userLevel: string | undefined;
	kinds?: string[];
	completer?: IAiCompleter;
}): Promise<{ results: Record<string, IGenerationRunResult> }> => {
	const session = sessionDomain.assertSessionExists(await sessionQueries.findSessionById(ctx.idSession));
	sessionDomain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);

	const kinds: TGenerationKind[] =
		ctx.kinds && ctx.kinds.length > 0
			? ctx.kinds.map((kind) => assertGenerationKind(kind))
			: [...GENERATION_KINDS];

	const events = await eventQueries.listEventsBySession(ctx.idSession, 0, 2000);
	const checkpoints = await sessionQueries.listCheckpointsBySession(ctx.idSession);

	const context = buildAiSessionContext({
		session: {
			test_case_no: session.test_case_no,
			title: session.title,
			description: session.description,
			target_url: session.target_url,
			result: session.result,
			actual_result: session.actual_result
		},
		events: events.map(parseStoredEvent),
		checkpoints
	});

	const completer = ctx.completer ?? createOpenAiCompleter();
	const results: Record<string, IGenerationRunResult> = {};

	for (const kind of kinds) {
		const idGeneration = await generationRepo.startGeneration({
			idSession: ctx.idSession,
			kind,
			model: openAiConfig.MODEL,
			promptVersion: GENERATION_PROMPT_VERSION
		});

		try {
			const raw = await completer.complete({ system: buildSystemPrompt(kind), user: context });
			const output = normalizeAiOutput(kind, raw);
			await generationRepo.markGenerationCompleted(idGeneration, output);
			results[kind] = { status: 'completed', output };
		} catch (error) {
			// Session tetap selesai meski AI gagal; retry dilakukan lewat endpoint yang sama.
			await generationRepo.markGenerationFailed(idGeneration, (error as Error).message);
			results[kind] = { status: 'failed', error: (error as Error).message };
		}
	}

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
