import { randomUUID } from 'crypto';
import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import * as domain from '../domain/session.domain';
import * as queries from '../queries/session.queries';
import * as repo from '../repo/session.repo';

export const createShareUrlUseCase = async (ctx: {
	idSession: number;
	userId: number;
	userLevel: string | undefined;
	baseUrl?: string;
}) => {
	const session = domain.assertSessionExists(await queries.findSessionById(ctx.idSession));
	domain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);

	let shareToken = session.share_token;
	if (!shareToken) {
		shareToken = randomUUID();
		await repo.updateSessionShareToken(ctx.idSession, shareToken);
	}

	const base = (ctx.baseUrl || 'http://127.0.0.1:8010').replace(/\/+$/, '');
	const shareUrl = `${base}/share/${shareToken}`;

	return {
		share_token: shareToken,
		share_url: shareUrl
	};
};
