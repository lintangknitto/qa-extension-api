import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import { randomUUID } from 'node:crypto';
import { buildPublicObjectUrl, statArtifactObject, putArtifactObjectBuffer } from '@/libs/config/minioClient';
import * as sessionQueries from '../queries/session.queries';
import * as sessionDomain from '../domain/session.domain';
import * as sessionRepo from '../repo/session.repo';

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB

const videoKeyPrefix = (idSession: number) => `sessions/${idSession}/video/`;
/** UUID, bukan session+timestamp: bucket bisa ditulis publik, key yang bisa ditebak memudahkan penimpaan. */
export const buildVideoObjectKey = (idSession: number): string => `${videoKeyPrefix(idSession)}${randomUUID()}.webm`;

export const uploadSessionVideoDirectUseCase = async (ctx: {
	idSession: number;
	userId: number;
	userLevel: string | undefined;
	videoBuffer: Buffer;
	contentType?: string;
}) => {
	const session = sessionDomain.assertSessionExists(await sessionQueries.findSessionById(ctx.idSession));
	sessionDomain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);

	if (ctx.videoBuffer.length > MAX_VIDEO_BYTES) {
		throw new InvalidParameterException('Ukuran video melebihi batas 100MB.');
	}

	const contentType = ctx.contentType || 'video/webm';
	const objectKey = buildVideoObjectKey(ctx.idSession);

	await putArtifactObjectBuffer(objectKey, ctx.videoBuffer, contentType);
	await sessionRepo.updateSessionVideoObjectKey(ctx.idSession, objectKey);

	return {
		id_session: ctx.idSession,
		video_url: buildPublicObjectUrl(objectKey),
		object_key: objectKey,
		size_bytes: ctx.videoBuffer.length
	};
};

export const presignSessionVideoUseCase = async (ctx: {
	idSession: number;
	userId: number;
	userLevel: string | undefined;
	input: { size_bytes: number; content_type?: string };
}) => {
	const session = sessionDomain.assertSessionExists(await sessionQueries.findSessionById(ctx.idSession));
	sessionDomain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);

	if (ctx.input.size_bytes > MAX_VIDEO_BYTES) {
		throw new InvalidParameterException('Ukuran video melebihi batas 100MB.');
	}

	const contentType = ctx.input.content_type || 'video/webm';
	const objectKey = buildVideoObjectKey(ctx.idSession);

	return {
		upload_url: buildPublicObjectUrl(objectKey),
		object_key: objectKey,
		content_type: contentType,
		expires_in: 3600
	};
};

export const completeSessionVideoUseCase = async (ctx: {
	idSession: number;
	userId: number;
	userLevel: string | undefined;
	input: { object_key: string };
}) => {
	const session = sessionDomain.assertSessionExists(await sessionQueries.findSessionById(ctx.idSession));
	sessionDomain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);

	const objectKey = ctx.input.object_key;
	const prefix = videoKeyPrefix(ctx.idSession);
	if (!objectKey?.startsWith(prefix) || !/^[0-9a-f-]{36}\.webm$/.test(objectKey.slice(prefix.length))) {
		throw new InvalidParameterException('Object key tidak valid untuk sesi ini.');
	}

	try {
		await statArtifactObject(objectKey);
	} catch {
		throw new InvalidParameterException('File video belum berhasil terunggah ke storage MinIO.');
	}

	await sessionRepo.updateSessionVideoObjectKey(ctx.idSession, objectKey);

	return {
		id_session: ctx.idSession,
		video_url: buildPublicObjectUrl(objectKey),
		object_key: objectKey
	};
};

export const getSessionVideoUrlUseCase = async (ctx: {
	idSession: number;
	userId: number;
	userLevel: string | undefined;
}) => {
	const session = sessionDomain.assertSessionExists(await sessionQueries.findSessionById(ctx.idSession));
	sessionDomain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);

	return {
		id_session: ctx.idSession,
		video_url: session.video_object_key ? buildPublicObjectUrl(session.video_object_key) : null
	};
};
