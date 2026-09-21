import { PROJECT_ADMIN_LEVELS, recordingConfig } from '@/libs/config';
import { createPresignedPutUrl } from '@/libs/config/minioClient';
import {
	assertAllowedContentType,
	assertSizeAllowed,
	assertSupportedArtifactKind,
	buildArtifactObjectKey,
	toArtifactResponse
} from '../domain/artifact';
import * as artifactQueries from '../queries/artifact.queries';
import * as artifactRepo from '../repo/artifact.repo';
import * as sessionQueries from '../../session/queries/session.queries';
import * as sessionDomain from '../../session/domain/session.domain';

export const presignArtifactUploadUseCase = async (ctx: {
	idSession: number;
	userId: number;
	userLevel: string | undefined;
	input: { kind: string; content_type: string; size_bytes: number; sequence?: number };
}) => {
	const session = sessionDomain.assertSessionExists(await sessionQueries.findSessionById(ctx.idSession));
	sessionDomain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);
	sessionDomain.assertSessionIsRecording(session);

	const kind = assertSupportedArtifactKind(ctx.input.kind);
	assertAllowedContentType(ctx.input.content_type, recordingConfig.ARTIFACT_CONTENT_TYPES);
	assertSizeAllowed(ctx.input.size_bytes, recordingConfig.UPLOAD_MAX_BYTES);

	const objectKey = buildArtifactObjectKey({
		idSession: ctx.idSession,
		kind,
		contentType: ctx.input.content_type
	});

	const idArtifact = await artifactRepo.insertArtifact({
		idSession: ctx.idSession,
		kind,
		objectKey,
		contentType: ctx.input.content_type,
		sizeBytes: ctx.input.size_bytes,
		sequence: ctx.input.sequence ?? null
	});

	const uploadUrl = await createPresignedPutUrl(objectKey, recordingConfig.PRESIGN_EXPIRY_SECONDS);
	const created = await artifactQueries.findArtifactById(idArtifact);

	return {
		artifact: toArtifactResponse(created),
		upload_url: uploadUrl,
		object_key: objectKey,
		expires_in: recordingConfig.PRESIGN_EXPIRY_SECONDS
	};
};
