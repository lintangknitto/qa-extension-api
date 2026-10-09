import { InvalidParameterException, NotFoundException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import { buildPublicObjectUrl, statArtifactObject } from '@/libs/config/minioClient';
import type { TCreateRunValidation } from '../session.request';
import * as domain from '../domain/session.domain';
import * as queries from '../queries/session.queries';
import * as repo from '../repo/session.repo';
import * as runRepo from '../repo/session-run.repo';
import * as tcRepo from '../../test-case/repo/test-case.repo';
import { MAX_VIDEO_BYTES, buildVideoObjectKey, isValidVideoObjectKey } from './session-video.use-case';

interface IAccessCtx {
	idSession: number;
	userId: number;
	userLevel: string | undefined;
}

const loadAccessibleSession = async (ctx: IAccessCtx): Promise<Entity.IQaRecordingSession> => {
	const session = domain.assertSessionExists(await queries.findSessionById(ctx.idSession));
	domain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);
	return session;
};

const loadRun = async (idSession: number, runNumber: number): Promise<Entity.IQaRecordingSessionRun> => {
	const run = await runRepo.findRunByNumber(idSession, runNumber);
	if (!run) throw new NotFoundException('Run tidak ditemukan.');
	return run;
};

export const createRunUseCase = async (ctx: IAccessCtx & { input: TCreateRunValidation }) => {
	const session = await loadAccessibleSession(ctx);
	domain.assertSessionIsCompleted(session);
	const result = domain.assertValidSessionResult(ctx.input.result);

	// Sesi lama tanpa Run #1 (mis. selesai sebelum migration): buat dulu agar re-run tidak menjadi Run #1.
	if (!(await runRepo.findRunByNumber(ctx.idSession, 1))) {
		await runRepo.upsertOriginalRun(ctx.idSession, session.owner_user_id ?? null);
	}

	const actualResult = ctx.input.actual_result ?? null;
	const run = await runRepo.insertRerun({
		idSession: ctx.idSession,
		result,
		actualResult,
		executedSteps: ctx.input.executed_steps ?? null,
		error: ctx.input.error ?? null,
		startedAt: ctx.input.started_at ?? null,
		endedAt: ctx.input.ended_at ?? null,
		createdByUserId: ctx.userId
	});

	// Run terakhir menjadi hasil sesi dan status test case (retest setelah perbaikan).
	await repo.updateSessionResult(ctx.idSession, result, actualResult);
	if (session.id_test_case) {
		await tcRepo.updateTestCaseStatusAndEvidence(
			Number(session.id_test_case),
			domain.testCaseStatusForResult(result),
			actualResult,
			ctx.idSession
		);
	}

	return domain.toRunResponse(session, run);
};

export const listRunsUseCase = async (ctx: IAccessCtx) => {
	const session = await loadAccessibleSession(ctx);
	const runs = await runRepo.listRunsBySession(ctx.idSession);
	return runs.map((run) => domain.toRunResponse(session, run));
};

export const presignRunVideoUseCase = async (
	ctx: IAccessCtx & { runNumber: number; input: { size_bytes: number; content_type?: string } }
) => {
	const session = await loadAccessibleSession(ctx);
	const run = await loadRun(ctx.idSession, ctx.runNumber);
	if (ctx.input.size_bytes > MAX_VIDEO_BYTES) {
		throw new InvalidParameterException('Ukuran video melebihi batas 100MB.');
	}

	const objectKey = buildVideoObjectKey(ctx.idSession, domain.videoFileNameForRun(session, { ...run, video_object_key: null }));
	return {
		upload_url: buildPublicObjectUrl(objectKey),
		object_key: objectKey,
		content_type: ctx.input.content_type || 'video/webm',
		expires_in: 3600
	};
};

export const completeRunVideoUseCase = async (
	ctx: IAccessCtx & { runNumber: number; input: { object_key: string } }
) => {
	const session = await loadAccessibleSession(ctx);
	const run = await loadRun(ctx.idSession, ctx.runNumber);

	const objectKey = ctx.input.object_key;
	if (!isValidVideoObjectKey(ctx.idSession, objectKey) || objectKey === session.video_object_key) {
		throw new InvalidParameterException('Object key tidak valid untuk run ini.');
	}

	let size: number;
	try {
		({ size } = await statArtifactObject(objectKey));
	} catch {
		throw new InvalidParameterException('File video belum berhasil terunggah ke storage MinIO.');
	}
	if (size > MAX_VIDEO_BYTES) {
		throw new InvalidParameterException('Ukuran video melebihi batas 100MB.');
	}

	await runRepo.updateRunVideoObjectKey(Number(run.id_run), objectKey);
	return domain.toRunResponse(session, { ...run, video_object_key: objectKey });
};
