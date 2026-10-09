import { Router, requestHandler, requestValidator } from '@knittotextile/knitto-http';
import controller from './artifact.controller';
import request from './artifact.request';

const router = Router();

router.get(
	['/sessions/:id_session/artifacts', '/api/v1/sessions/:id_session/artifacts'],
	requestValidator({ requestType: 'params', type: request.sessionParamValidation }),
	requestHandler(controller.list)
);

router.post(
	['/sessions/:id_session/artifacts/presign-upload', '/api/v1/sessions/:id_session/artifacts/presign-upload'],
	requestValidator({ requestType: 'params', type: request.sessionParamValidation }),
	requestValidator({ requestType: 'body', type: request.presignArtifactUploadValidation }),
	requestHandler(controller.presignUpload)
);

router.post(
	['/sessions/:id_session/artifacts/:id_artifact/complete', '/api/v1/sessions/:id_session/artifacts/:id_artifact/complete'],
	requestValidator({ requestType: 'params', type: request.sessionArtifactParamValidation }),
	requestValidator({ requestType: 'body', type: request.completeArtifactUploadValidation }),
	requestHandler(controller.completeUpload)
);

router.get(
	['/sessions/:id_session/artifacts/:id_artifact/download-url', '/api/v1/sessions/:id_session/artifacts/:id_artifact/download-url'],
	requestValidator({ requestType: 'params', type: request.sessionArtifactParamValidation }),
	requestHandler(controller.downloadUrl)
);

router.get(
	['/sessions/:id_session/test-data-files', '/api/v1/sessions/:id_session/test-data-files'],
	requestValidator({ requestType: 'params', type: request.sessionParamValidation }),
	requestHandler(controller.listTestDataFiles)
);

router.put(
	['/sessions/:id_session/test-data-files', '/api/v1/sessions/:id_session/test-data-files'],
	requestValidator({ requestType: 'params', type: request.sessionParamValidation }),
	requestValidator({ requestType: 'body', type: request.linkTestDataFilesValidation }),
	requestHandler(controller.linkTestDataFiles)
);

export default router;
