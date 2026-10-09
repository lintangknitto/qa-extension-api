import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import { randomUUID } from 'node:crypto';
import { buildPublicObjectUrl, statArtifactObject, putArtifactObjectBuffer } from '@/libs/config/minioClient';
import * as sessionQueries from '../queries/session.queries';
import * as sessionDomain from '../domain/session.domain';
import * as sessionRepo from '../repo/session.repo';
import * as runRepo from '../repo/session-run.repo';
import { buildVideoFileName, VIDEO_FILE_NAME_MAX_LENGTH } from '@/libs/helpers/videoFileName';

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** Format lama `<uuid>.webm` tetap diterima agar key yang sudah tersimpan tetap valid. */
const LEGACY_VIDEO_FILE = new RegExp(`^${UUID}\\.webm$`);
const NAMED_VIDEO_FOLDER = new RegExp(`^${UUID}$`);
// eslint-disable-next-line no-control-regex
const SAFE_VIDEO_NAME = /^[^\\/:*?"<>|\u0000-\u001f\u007f]+\.webm$/;
const videoKeyPrefix = (idSession: number) => `sessions/${idSession}/video/`;

/** Folder UUID membuat key tidak bisa ditebak (bucket bisa ditulis publik); nama file dibekukan saat upload. */
export const buildVideoObjectKey = (idSession: number, fileName: string): string =>
	`${videoKeyPrefix(idSession)}${randomUUID()}/${fileName}`;

export const isValidVideoObjectKey = (idSession: number, objectKey: string | undefined | null): boolean => {
	const prefix = videoKeyPrefix(idSession);
	if (!objectKey?.startsWith(prefix)) return false;
	const rest = objectKey.slice(prefix.length);
	if (LEGACY_VIDEO_FILE.test(rest)) return true;
	const parts = rest.split('/');
	if (parts.length !== 2) return false;
	const [folder, name] = parts;
	return NAMED_VIDEO_FOLDER.test(folder)
		&& name.length <= VIDEO_FILE_NAME_MAX_LENGTH
		&& name.trim() === name
		&& !name.startsWith('.')
		&& SAFE_VIDEO_NAME.test(name);
};

/** Nama file video sesi = Run #1. */
export const sessionVideoFileName = (session: Entity.IQaRecordingSession): string =>
	buildVideoFileName({
		testCaseNo: session.test_case_no,
		title: session.title,
		startedAt: session.started_at ?? session.created_at ?? new Date(),
		runNumber: 1
	});

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
	const objectKey = buildVideoObjectKey(ctx.idSession, sessionVideoFileName(session));

	await putArtifactObjectBuffer(objectKey, ctx.videoBuffer, contentType);
	await sessionRepo.updateSessionVideoObjectKey(ctx.idSession, objectKey);
	await runRepo.updateOriginalRunVideoObjectKey(ctx.idSession, objectKey);

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
	const objectKey = buildVideoObjectKey(ctx.idSession, sessionVideoFileName(session));

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
	if (!isValidVideoObjectKey(ctx.idSession, objectKey)) {
		throw new InvalidParameterException('Object key tidak valid untuk sesi ini.');
	}

	let size: number;
	try {
		({ size } = await statArtifactObject(objectKey));
	} catch {
		throw new InvalidParameterException('File video belum berhasil terunggah ke storage MinIO.');
	}
	// Bucket bisa ditulis publik: ukuran dicek dari objek yang benar-benar terunggah, bukan nilai saat presign.
	if (size > MAX_VIDEO_BYTES) {
		throw new InvalidParameterException('Ukuran video melebihi batas 100MB.');
	}

	await sessionRepo.updateSessionVideoObjectKey(ctx.idSession, objectKey);
	await runRepo.updateOriginalRunVideoObjectKey(ctx.idSession, objectKey);

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
