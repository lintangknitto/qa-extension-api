import {
	InvalidParameterException,
	NotAuthorizationException,
	NotFoundException
} from '@knittotextile/knitto-core-backend/dist/CoreException';
import { canManageProjects } from '@/libs/helpers/access';

export const SESSION_STATUS = {
	RECORDING: 'recording',
	COMPLETED: 'completed'
} as const;

export const SESSION_RESULTS = ['PASS', 'FAIL', 'BLOCKED'] as const;
export type TSessionResult = (typeof SESSION_RESULTS)[number];

export const SESSION_TITLE_MAX_LENGTH = 255;
export const SESSION_TEST_CASE_NO_MAX_LENGTH = 80;

export const assertValidSessionResult = (result: string): TSessionResult => {
	if (!SESSION_RESULTS.includes(result as TSessionResult))
		throw new InvalidParameterException('Hasil session harus salah satu dari PASS, FAIL, atau BLOCKED.');
	return result as TSessionResult;
};

export const assertSessionIsRecording = (session: Entity.IQaRecordingSession): void => {
	if (session.status !== SESSION_STATUS.RECORDING)
		throw new InvalidParameterException('Session sudah tidak dalam status recording.');
};

export const assertSessionExists = (
	session: Entity.IQaRecordingSession | null
): Entity.IQaRecordingSession => {
	if (!session) throw new NotFoundException('Session tidak ditemukan.');
	return session;
};

export const canAccessSession = (
	session: Entity.IQaRecordingSession,
	userId: number,
	userLevel: string | undefined,
	adminLevels: readonly string[]
): boolean => session.owner_user_id === userId || canManageProjects(userLevel, adminLevels);

export const assertCanAccessSession = (
	session: Entity.IQaRecordingSession,
	userId: number,
	userLevel: string | undefined,
	adminLevels: readonly string[]
): void => {
	if (!canAccessSession(session, userId, userLevel, adminLevels))
		throw new NotAuthorizationException('Anda tidak berhak mengakses session ini.');
};

export const toSessionResponse = (session: Entity.IQaRecordingSession) => {
	const value = (item: unknown): unknown => item ?? null;
	return {
		id_session: value(session.id_session),
		id_project: value(session.id_project),
		id_test_case: value(session.id_test_case),
		test_case_no: value(session.test_case_no),
		title: value(session.title),
		description: value(session.description),
		target_url: value(session.target_url),
		owner_user_id: value(session.owner_user_id),
		status: value(session.status),
		result: value(session.result),
		actual_result: value(session.actual_result),
		share_token: value(session.share_token),
		video_url: value(session.video_url),
		record_video: session.record_video !== undefined ? Number(session.record_video) : 1,
		last_sequence: Number(session.last_sequence ?? 0),
		started_at: value(session.started_at),
		ended_at: value(session.ended_at),
		created_at: value(session.created_at),
		updated_at: value(session.updated_at)
	};
};

export const toCheckpointResponse = (checkpoint: Entity.IQaRecordingCheckpoint) => ({
	id_checkpoint: checkpoint.id_checkpoint ?? null,
	id_session: checkpoint.id_session ?? null,
	note: checkpoint.note ?? null,
	sequence: checkpoint.sequence ?? null,
	id_artifact: checkpoint.id_artifact ?? null,
	created_by_user_id: checkpoint.created_by_user_id ?? null,
	created_at: checkpoint.created_at ?? null
});
