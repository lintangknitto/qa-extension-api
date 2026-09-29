import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import { toArtifactResponse } from '../domain/artifact';
import * as artifactQueries from '../queries/artifact.queries';
import * as sessionQueries from '../../session/queries/session.queries';
import * as sessionDomain from '../../session/domain/session.domain';

export const listArtifactsUseCase = async (ctx: {
	idSession: number;
	userId: number;
	userLevel: string | undefined;
}) => {
	const session = sessionDomain.assertSessionExists(await sessionQueries.findSessionById(ctx.idSession));
	sessionDomain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);

	const items = await artifactQueries.listArtifactsBySession(ctx.idSession);
	return {
		items: items.map(toArtifactResponse)
	};
};
