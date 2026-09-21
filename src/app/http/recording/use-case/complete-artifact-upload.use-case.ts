import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { PROJECT_ADMIN_LEVELS, recordingConfig } from '@/libs/config';
import { statArtifactObject } from '@/libs/config/minioClient';
import {
	assertArtifactBelongsToSession,
	assertArtifactExists,
	assertUploadedObjectAllowed,
	toArtifactResponse
} from '../domain/artifact';
import * as artifactQueries from '../queries/artifact.queries';
import * as artifactRepo from '../repo/artifact.repo';
import * as sessionQueries from '../../session/queries/session.queries';
import * as sessionDomain from '../../session/domain/session.domain';

export const completeArtifactUploadUseCase = async (ctx: {
	idSession: number;
	idArtifact: number;
	userId: number;
	userLevel: string | undefined;
	input: { size_bytes?: number; checksum_sha256?: string };
}) => {
	const session = sessionDomain.assertSessionExists(await sessionQueries.findSessionById(ctx.idSession));
	sessionDomain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);

	const artifact = assertArtifactExists(await artifactQueries.findArtifactById(ctx.idArtifact));
	assertArtifactBelongsToSession(artifact, ctx.idSession);

	// Verifikasi objek yang benar-benar terunggah, bukan hanya nilai yang
	// dikirim client saat presign.
	let stat: Awaited<ReturnType<typeof statArtifactObject>>;
	try {
		stat = await statArtifactObject(artifact.object_key);
	} catch {
		throw new InvalidParameterException('Artifact belum terunggah ke storage.');
	}

	assertUploadedObjectAllowed(
		{ size: stat.size, contentType: stat.metaData?.['content-type'] ?? artifact.content_type },
		{ maxBytes: recordingConfig.UPLOAD_MAX_BYTES, allowedContentTypes: recordingConfig.ARTIFACT_CONTENT_TYPES }
	);

	await artifactRepo.markArtifactUploaded(ctx.idArtifact, {
		sizeBytes: stat.size,
		checksumSha256: ctx.input.checksum_sha256 ?? null
	});

	const updated = await artifactQueries.findArtifactById(ctx.idArtifact);
	return toArtifactResponse(updated);
};
