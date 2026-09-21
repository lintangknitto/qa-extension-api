import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import type { TCreateCheckpointValidation } from '../session.request';
import * as artifactDomain from '../../recording/domain/artifact';
import * as artifactQueries from '../../recording/queries/artifact.queries';
import * as domain from '../domain/session.domain';
import * as queries from '../queries/session.queries';
import * as repo from '../repo/session.repo';

export const createCheckpointUseCase = async (ctx: {
	userId: number;
	userLevel: string | undefined;
	idSession: number;
	input: TCreateCheckpointValidation;
}) => {
	const session = domain.assertSessionExists(await queries.findSessionById(ctx.idSession));
	domain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);
	domain.assertSessionIsRecording(session);

	if (ctx.input.id_artifact !== undefined && ctx.input.id_artifact !== null) {
		const artifact = artifactDomain.assertArtifactExists(
			await artifactQueries.findArtifactById(ctx.input.id_artifact)
		);
		artifactDomain.assertArtifactBelongsToSession(artifact, ctx.idSession);
	}

	const idCheckpoint = await repo.insertCheckpoint({
		idSession: ctx.idSession,
		note: ctx.input.note,
		sequence: ctx.input.sequence ?? null,
		idArtifact: ctx.input.id_artifact ?? null,
		createdByUserId: ctx.userId
	});

	const created = await repo.findCheckpointById(idCheckpoint);
	if (!created) throw new Error('Checkpoint gagal disimpan.');
	return domain.toCheckpointResponse(created);
};
