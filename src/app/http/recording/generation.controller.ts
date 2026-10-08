import { TRequestFunction } from '@knittotextile/knitto-http';
import type {
	TGenerateSessionValidation,
	TReplayFailureValidation,
	TSessionGenerationParamValidation
} from './generation.request';
import { investigateSessionUseCase } from './use-case/investigate-session.use-case';
import { reportReplayFailureUseCase } from './use-case/report-replay-failure.use-case';
import {
	generateSessionOutputsUseCase,
	listGenerationsUseCase
} from './use-case/generate-session-outputs.use-case';

const generate: TRequestFunction = async (req) => {
	const params = req.params as unknown as TSessionGenerationParamValidation;
	const input = req.body as TGenerateSessionValidation;
	const result = await generateSessionOutputsUseCase({
		idSession: params.id_session,
		userId: req.userId,
		userLevel: req.userData?.level,
		kinds: input.kinds
	});
	return { result };
};

const list: TRequestFunction = async (req) => {
	const params = req.params as unknown as TSessionGenerationParamValidation;
	const result = await listGenerationsUseCase({
		idSession: params.id_session,
		userId: req.userId,
		userLevel: req.userData?.level
	});
	return { result };
};

const investigate: TRequestFunction = async (req) => {
	const params = req.params as unknown as TSessionGenerationParamValidation;
	const result = await investigateSessionUseCase({
		idSession: params.id_session,
		userId: req.userId,
		userLevel: req.userData?.level
	});
	return { result };
};

const reportReplayFailure: TRequestFunction = async (req) => {
	const params = req.params as unknown as TSessionGenerationParamValidation;
	const result = await reportReplayFailureUseCase({
		idSession: params.id_session,
		userId: req.userId,
		userLevel: req.userData?.level,
		input: req.body as TReplayFailureValidation
	});
	return { result };
};

export default {
	generate,
	list,
	investigate,
	reportReplayFailure
};
