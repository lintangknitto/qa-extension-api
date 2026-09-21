import { TRequestFunction } from '@knittotextile/knitto-http';
import type { TGenerateSessionValidation, TSessionGenerationParamValidation } from './generation.request';
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

export default {
	generate,
	list
};
