import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import * as sessionQueries from '../../session/queries/session.queries';
import * as sessionDomain from '../../session/domain/session.domain';
import * as eventRepo from '../repo/recording-event.repo';
import { REPLAY_FAILURE_EVENT_TYPE } from '../domain/investigation-context';
import type { TReplayFailureValidation } from '../generation.request';
import { loadSessionEvents } from './load-session-events';
import { startInvestigationInBackground, type BackgroundRunner, type InvestigationDeps } from './investigate-session.use-case';

/**
 * Replay di extension gagal pada suatu langkah: catat sebagai event `replay_failure`
 * lalu jalankan investigasi di background (hasil dikirim lewat WS `generation:*`).
 */
export const reportReplayFailureUseCase = async (
	ctx: { idSession: number; userId: number; userLevel: string | undefined; input: TReplayFailureValidation },
	deps: InvestigationDeps & { runInBackground?: BackgroundRunner } = {}
): Promise<{ recorded: true; investigation: 'started' | 'already_running' }> => {
	const session = sessionDomain.assertSessionExists(await sessionQueries.findSessionById(ctx.idSession));
	sessionDomain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);

	await eventRepo.appendServerEvent(ctx.idSession, REPLAY_FAILURE_EVENT_TYPE, {
		step_no: ctx.input.step_no,
		error: ctx.input.error,
		step_description: ctx.input.step_description ?? null,
		selector: ctx.input.selector ?? null,
		total_steps: ctx.input.total_steps ?? null,
		reported_by_user_id: ctx.userId
	});

	const investigation = startInvestigationInBackground(session, async () => (await loadSessionEvents(ctx.idSession)).events, deps);
	return { recorded: true, investigation };
};
