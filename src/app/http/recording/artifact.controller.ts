import { TRequestFunction } from '@knittotextile/knitto-http';
import type {
	TCompleteArtifactUploadValidation,
	TLinkTestDataFilesValidation,
	TPresignArtifactUploadValidation,
	TSessionArtifactParamValidation,
	TSessionParamValidation
} from './artifact.request';
import { presignArtifactUploadUseCase } from './use-case/presign-artifact-upload.use-case';
import { completeArtifactUploadUseCase } from './use-case/complete-artifact-upload.use-case';
import { getArtifactDownloadUrlUseCase } from './use-case/get-artifact-download-url.use-case';
import { listArtifactsUseCase } from './use-case/list-artifacts.use-case';
import { linkTestDataFilesUseCase, listTestDataFilesUseCase } from './use-case/test-data-files.use-case';

const list: TRequestFunction = async (req) => {
	const params = req.params as unknown as TSessionParamValidation;
	const result = await listArtifactsUseCase({
		idSession: params.id_session,
		userId: req.userId,
		userLevel: req.userData?.level
	});
	return { result };
};

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

const listTestDataFiles: TRequestFunction = async (req) => {
	const params = req.params as unknown as TSessionParamValidation;
	const result = await listTestDataFilesUseCase({ idSession: params.id_session, userId: req.userId, userLevel: req.userData?.level });
	return { result };
};

const linkTestDataFiles: TRequestFunction = async (req) => {
	const params = req.params as unknown as TSessionParamValidation;
	const result = await linkTestDataFilesUseCase({
		idSession: params.id_session,
		userId: req.userId,
		userLevel: req.userData?.level,
		input: req.body as TLinkTestDataFilesValidation
	});
	return { result };
};

export default {
	listTestDataFiles,
	linkTestDataFiles,
	list,
	presignUpload,
	completeUpload,
	downloadUrl
};
