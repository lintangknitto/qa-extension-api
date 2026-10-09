import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { PROJECT_ADMIN_LEVELS, recordingConfig } from '@/libs/config';
import { buildPublicObjectUrl } from '@/libs/config/minioClient';
import {
	ARTIFACT_STATUS,
	assertArtifactBelongsToSession,
	assertArtifactExists
} from '../domain/artifact';
import * as artifactQueries from '../queries/artifact.queries';
import * as sessionQueries from '../../session/queries/session.queries';
import * as sessionDomain from '../../session/domain/session.domain';

export const getArtifactDownloadUrlUseCase = async (ctx: {
	idSession: number;
	idArtifact: number;
	userId: number;
	userLevel: string | undefined;
}) => {
	const session = sessionDomain.assertSessionExists(await sessionQueries.findSessionById(ctx.idSession));
	sessionDomain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);

	const artifact = assertArtifactExists(await artifactQueries.findArtifactById(ctx.idArtifact));
	assertArtifactBelongsToSession(artifact, ctx.idSession);

	if (artifact.status !== ARTIFACT_STATUS.UPLOADED)
		throw new InvalidParameterException('Artifact belum selesai diupload.');

	// Bucket public: URL langsung tanpa signature. `expires_in` dipertahankan demi kompatibilitas response.
	return { download_url: buildPublicObjectUrl(artifact.object_key), expires_in: recordingConfig.PRESIGN_EXPIRY_SECONDS };
};
