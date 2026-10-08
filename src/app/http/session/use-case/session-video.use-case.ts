import { InvalidParameterException, NotFoundException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import {
	createPresignedPutUrl,
	createPresignedGetUrl,
	statArtifactObject,
	getArtifactObjectStream,
	getArtifactObjectRange,
	putArtifactObjectBuffer
} from '@/libs/config/minioClient';
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

export interface IVideoRange {
	start: number;
	end: number;
}

/**
 * Parse header `Range: bytes=start-end` (satu rentang). `null` = kirim utuh;
 * `'unsatisfiable'` = rentang di luar ukuran file (HTTP 416).
 */
export const parseVideoRange = (header: string | undefined, size: number): IVideoRange | null | 'unsatisfiable' => {
	const match = header?.match(/^bytes=(\d*)-(\d*)$/);
	if (!match || (match[1] === '' && match[2] === '')) return null;
	let start: number;
	let end: number;
	if (match[1] === '') {
		// bytes=-N → N byte terakhir
		start = Math.max(0, size - Number(match[2]));
		end = size - 1;
	} else {
		start = Number(match[1]);
		end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
	}
	if (start >= size || start > end) return 'unsatisfiable';
	return { start, end };
};

/** Object key MinIO dari `video_url` presigned (host/tanda tangan diabaikan); `null` bila tidak dikenali. */
export const videoObjectKeyFromUrl = (videoUrl: string): string | null => videoUrl.match(/sessions\/\d+\/[^?&]+/)?.[0] ?? null;

const videoObjectKeyOf = (session: Entity.IQaRecordingSession): string => {
	if (!session.video_url) throw new NotFoundException('Sesi ini belum memiliki rekaman video.');
	return videoObjectKeyFromUrl(session.video_url) ?? `sessions/${session.id_project || 0}/${session.id_session}-video`;
};

const streamVideoOf = async (session: Entity.IQaRecordingSession, rangeHeader?: string) => {
	const objectKey = videoObjectKeyOf(session);
	const stat = await statArtifactObject(objectKey);
	const contentType = stat.metaData?.['content-type'] || 'video/webm';
	const range = parseVideoRange(rangeHeader, stat.size);
	if (range === 'unsatisfiable') return { kind: 'unsatisfiable' as const, size: stat.size, contentType };
	if (range) {
		const stream = await getArtifactObjectRange(objectKey, range.start, range.end - range.start + 1);
		return { kind: 'partial' as const, stream, size: stat.size, range, contentType };
	}
	return { kind: 'full' as const, stream: await getArtifactObjectStream(objectKey), size: stat.size, contentType };
};

export type TVideoStream = Awaited<ReturnType<typeof streamVideoOf>>;

export const streamSessionVideoUseCase = async (ctx: { idSession: number; range?: string }) =>
	streamVideoOf(sessionDomain.assertSessionExists(await sessionQueries.findSessionById(ctx.idSession)), ctx.range);

/**
 * Video untuk halaman share: diotorisasi share token dan di-stream lewat API, sehingga
 * bisa diputar dari komputer lain (URL presigned MinIO menunjuk host internal/127.0.0.1
 * dan kedaluwarsa).
 */
export const streamSharedSessionVideoUseCase = async (ctx: { shareToken: string; range?: string }) => {
	const session = await sessionQueries.findSessionByShareToken(ctx.shareToken);
	if (!session) throw new NotFoundException('Sesi rekaman dengan share token ini tidak ditemukan.');
	return streamVideoOf(session, ctx.range);
};

