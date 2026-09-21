import { TRequestFunction } from '@knittotextile/knitto-http';
import type {
	TCompleteArtifactUploadValidation,
	TPresignArtifactUploadValidation,
	TSessionArtifactParamValidation,
	TSessionParamValidation
} from './artifact.request';
import { presignArtifactUploadUseCase } from './use-case/presign-artifact-upload.use-case';
import { completeArtifactUploadUseCase } from './use-case/complete-artifact-upload.use-case';
import { getArtifactDownloadUrlUseCase } from './use-case/get-artifact-download-url.use-case';

const presignUpload: TRequestFunction = async (req) => {
	const params = req.params as unknown as TSessionParamValidation;
	const input = req.body as TPresignArtifactUploadValidation;
	const result = await presignArtifactUploadUseCase({
		idSession: params.id_session,
		userId: req.userId,
		userLevel: req.userData?.level,
		input
	});
	return { result, statusCode: 201 };
};

const completeUpload: TRequestFunction = async (req) => {
	const params = req.params as unknown as TSessionArtifactParamValidation;
	const input = req.body as TCompleteArtifactUploadValidation;
	const result = await completeArtifactUploadUseCase({
		idSession: params.id_session,
		idArtifact: params.id_artifact,
		userId: req.userId,
		userLevel: req.userData?.level,
		input
	});
	return { result };
};

const downloadUrl: TRequestFunction = async (req) => {
	const params = req.params as unknown as TSessionArtifactParamValidation;
	const result = await getArtifactDownloadUrlUseCase({
		idSession: params.id_session,
		idArtifact: params.id_artifact,
		userId: req.userId,
		userLevel: req.userData?.level
	});
	return { result };
};

export default {
	presignUpload,
	completeUpload,
	downloadUrl
};
