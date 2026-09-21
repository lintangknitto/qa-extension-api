import { TRequestFunction } from '@knittotextile/knitto-http';
import type {
	TCreateCheckpointValidation,
	TCreateSessionValidation,
	TEndSessionValidation,
	TListSessionValidation,
	TSessionIdParamValidation
} from './session.request';
import { createSessionUseCase } from './use-case/create-session.use-case';
import { listSessionsUseCase } from './use-case/list-session.use-case';
import { detailSessionUseCase } from './use-case/detail-session.use-case';
import { endSessionUseCase } from './use-case/end-session.use-case';
import { createCheckpointUseCase } from './use-case/create-checkpoint.use-case';

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

export default {
	create,
	list,
	detail,
	end,
	createCheckpoint
};
