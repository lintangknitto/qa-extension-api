import { Router, requestHandler, requestValidator } from '@knittotextile/knitto-http';
import controller from './artifact.controller';
import request from './artifact.request';

const router = Router();

router.post(
	'/sessions/:id_session/artifacts/presign-upload',
	requestValidator({ requestType: 'params', type: request.sessionParamValidation }),
	requestValidator({ requestType: 'body', type: request.presignArtifactUploadValidation }),
	requestHandler(controller.presignUpload)
);

router.post(
	'/sessions/:id_session/artifacts/:id_artifact/complete',
	requestValidator({ requestType: 'params', type: request.sessionArtifactParamValidation }),
	requestValidator({ requestType: 'body', type: request.completeArtifactUploadValidation }),
	requestHandler(controller.completeUpload)
);

router.get(
	'/sessions/:id_session/artifacts/:id_artifact/download-url',
	requestValidator({ requestType: 'params', type: request.sessionArtifactParamValidation }),
	requestHandler(controller.downloadUrl)
);

export default router;
