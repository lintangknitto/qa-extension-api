import { TRequestFunction } from '@knittotextile/knitto-http';
import type {
	TCreateCheckpointValidation,
	TCreateSessionValidation,
	TEndSessionValidation,
	TListSessionValidation,
	TSessionIdParamValidation,
	TShareTokenParamValidation,
	TPresignVideoUploadValidation,
	TCompleteVideoUploadValidation
} from './session.request';
import { createSessionUseCase } from './use-case/create-session.use-case';
import { listSessionsUseCase } from './use-case/list-session.use-case';
import { detailSessionUseCase } from './use-case/detail-session.use-case';
import { endSessionUseCase } from './use-case/end-session.use-case';
import { createCheckpointUseCase } from './use-case/create-checkpoint.use-case';
import { createShareUrlUseCase } from './use-case/create-share-url.use-case';
import { getShareContextUseCase } from './use-case/get-share-context.use-case';
import {
	presignSessionVideoUseCase,
	completeSessionVideoUseCase,
	getSessionVideoUrlUseCase
} from './use-case/session-video.use-case';

const create: TRequestFunction = async (req) => {
	const input = req.body as TCreateSessionValidation;
	const result = await createSessionUseCase({ userId: req.userId, input });
	return { result, statusCode: 201 };
};

const list: TRequestFunction = async (req) => {
	const input = req.query as unknown as TListSessionValidation;
	const result = await listSessionsUseCase({
		userId: req.userId,
		userLevel: req.userData?.level,
		input
	});
	return { result };
};

const detail: TRequestFunction = async (req) => {
	const params = req.params as unknown as TSessionIdParamValidation;
	const result = await detailSessionUseCase({
		userId: req.userId,
		userLevel: req.userData?.level,
		idSession: params.id_session
	});
	return { result };
};

const end: TRequestFunction = async (req) => {
	const params = req.params as unknown as TSessionIdParamValidation;
	const input = req.body as TEndSessionValidation;
	const result = await endSessionUseCase({
		userId: req.userId,
		userLevel: req.userData?.level,
		idSession: params.id_session,
		input
	});
	return { result };
};

const createCheckpoint: TRequestFunction = async (req) => {
	const params = req.params as unknown as TSessionIdParamValidation;
	const input = req.body as TCreateCheckpointValidation;
	const result = await createCheckpointUseCase({
		userId: req.userId,
		userLevel: req.userData?.level,
		idSession: params.id_session,
		input
	});
	return { result, statusCode: 201 };
};

const createShareUrl: TRequestFunction = async (req) => {
	const params = req.params as unknown as TSessionIdParamValidation;
	const hostUrl = `${req.protocol}://${req.get('host')}`;
	const result = await createShareUrlUseCase({
		idSession: params.id_session,
		userId: req.userId,
		userLevel: req.userData?.level,
		baseUrl: hostUrl
	});
	return { result };
};

const getShareAiContext: TRequestFunction = async (req) => {
	const params = req.params as unknown as TShareTokenParamValidation;
	const result = await getShareContextUseCase(params.share_token);
	return { result };
};

const presignVideo: TRequestFunction = async (req) => {
	const params = req.params as unknown as TSessionIdParamValidation;
	const input = req.body as TPresignVideoUploadValidation;
	const result = await presignSessionVideoUseCase({
		idSession: params.id_session,
		userId: req.userId,
		userLevel: req.userData?.level,
		input
	});
	return { result, statusCode: 201 };
};

const completeVideo: TRequestFunction = async (req) => {
	const params = req.params as unknown as TSessionIdParamValidation;
	const input = req.body as TCompleteVideoUploadValidation;
	const result = await completeSessionVideoUseCase({
		idSession: params.id_session,
		userId: req.userId,
		userLevel: req.userData?.level,
		input
	});
	return { result };
};

const getVideoUrl: TRequestFunction = async (req) => {
	const params = req.params as unknown as TSessionIdParamValidation;
	const result = await getSessionVideoUrlUseCase({
		idSession: params.id_session,
		userId: req.userId,
		userLevel: req.userData?.level
	});
	return { result };
};

export default {
	create,
	list,
	detail,
	end,
	createCheckpoint,
	createShareUrl,
	getShareAiContext,
	presignVideo,
	completeVideo,
	getVideoUrl
};
