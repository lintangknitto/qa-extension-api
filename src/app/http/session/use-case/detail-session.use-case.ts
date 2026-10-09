import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import * as domain from '../domain/session.domain';
import * as queries from '../queries/session.queries';
import * as runRepo from '../repo/session-run.repo';

export const detailSessionUseCase = async (ctx: {
	userId: number;
	userLevel: string | undefined;
	idSession: number;
}) => {
	const session = domain.assertSessionExists(await queries.findSessionById(ctx.idSession));
	domain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);

	const [checkpoints, runs] = await Promise.all([
		queries.listCheckpointsBySession(ctx.idSession),
		runRepo.listRunsBySession(ctx.idSession)
	]);

	return {
		...domain.toSessionResponse(session),
		checkpoints: checkpoints.map(domain.toCheckpointResponse),
		runs: runs.map((run) => domain.toRunResponse(session, run))
	};
};
