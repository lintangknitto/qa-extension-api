import { InvalidParameterException, NotFoundException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import { createPresignedPutUrl, createPresignedGetUrl, statArtifactObject, getArtifactObjectStream, putArtifactObjectBuffer } from '@/libs/config/minioClient';
import * as sessionQueries from '../queries/session.queries';
import * as sessionDomain from '../domain/session.domain';
import * as sessionRepo from '../repo/session.repo';

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB

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
	const timestamp = Date.now();
	const objectKey = `sessions/${session.id_project || 0}/${ctx.idSession}-video-${timestamp}.webm`;

	await putArtifactObjectBuffer(objectKey, ctx.videoBuffer, contentType);

	const streamingUrl = await createPresignedGetUrl(objectKey, 7 * 24 * 3600);
	await sessionRepo.updateSessionVideoUrl(ctx.idSession, streamingUrl);

	return {
		id_session: ctx.idSession,
		video_url: streamingUrl,
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
	const timestamp = Date.now();
	const objectKey = `sessions/${session.id_project || 0}/${ctx.idSession}-video-${timestamp}.webm`;

	const uploadUrl = await createPresignedPutUrl(objectKey, 3600);

	return {
		upload_url: uploadUrl,
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

	const expectedPrefix = `sessions/${session.id_project || 0}/${ctx.idSession}-video-`;
	if (!ctx.input.object_key || !ctx.input.object_key.startsWith(expectedPrefix)) {
		throw new InvalidParameterException('Object key tidak valid untuk sesi ini.');
	}

	try {
		await statArtifactObject(ctx.input.object_key);
	} catch {
		throw new InvalidParameterException('File video belum berhasil terunggah ke storage MinIO.');
	}

	const streamingUrl = await createPresignedGetUrl(ctx.input.object_key, 7 * 24 * 3600);
	await sessionRepo.updateSessionVideoUrl(ctx.idSession, streamingUrl);

	return {
		id_session: ctx.idSession,
		video_url: streamingUrl,
		object_key: ctx.input.object_key
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
		video_url: session.video_url || null
	};
};

export const streamSessionVideoUseCase = async (ctx: {
	idSession: number;
}) => {
	const session = sessionDomain.assertSessionExists(await sessionQueries.findSessionById(ctx.idSession));
	if (!session.video_url) {
		throw new NotFoundException('Sesi ini belum memiliki rekaman video.');
	}

	let objectKey: string | null = null;
	const match = session.video_url.match(/sessions\/\d+\/[^?&]+/);
	if (match) {
		objectKey = match[0];
	} else {
		objectKey = `sessions/${session.id_project || 0}/${ctx.idSession}-video`;
	}

	const stat = await statArtifactObject(objectKey);
	const stream = await getArtifactObjectStream(objectKey);

	return {
		stream,
		size: stat.size,
		contentType: stat.metaData?.['content-type'] || 'video/webm'
	};
};

