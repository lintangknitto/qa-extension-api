import { Router, requestHandler, requestValidator } from '@knittotextile/knitto-http';
import controller from './session.controller';
import request from './session.request';
import { renderShareHtml } from './use-case/render-share-page';

const router = Router();

router.post(
	'/sessions',
	requestValidator({ requestType: 'body', type: request.createSessionValidation }),
	requestHandler(controller.create)
);

router.get(
	'/sessions',
	requestValidator({ requestType: 'query', type: request.listSessionValidation }),
	requestHandler(controller.list)
);

router.get(
	'/sessions/:id_session',
	requestValidator({ requestType: 'params', type: request.sessionIdParamValidation }),
	requestHandler(controller.detail)
);

router.post(
	'/sessions/:id_session/end',
	requestValidator({ requestType: 'params', type: request.sessionIdParamValidation }),
	requestValidator({ requestType: 'body', type: request.endSessionValidation }),
	requestHandler(controller.end)
);

router.post(
	'/sessions/:id_session/checkpoints',
	requestValidator({ requestType: 'params', type: request.sessionIdParamValidation }),
	requestValidator({ requestType: 'body', type: request.createCheckpointValidation }),
	requestHandler(controller.createCheckpoint)
);

router.post(
	'/sessions/:id_session/share',
	requestValidator({ requestType: 'params', type: request.sessionIdParamValidation }),
	requestHandler(controller.createShareUrl)
);

router.get(
	'/sessions/share/:share_token/ai-context',
	requestValidator({ requestType: 'params', type: request.shareTokenParamValidation }),
	requestHandler(controller.getShareAiContext)
);

router.get(
	'/api/v1/sessions/share/:share_token/ai-context',
	requestValidator({ requestType: 'params', type: request.shareTokenParamValidation }),
	requestHandler(controller.getShareAiContext)
);

router.post(
	'/sessions/:id_session/video/presign-upload',
	requestValidator({ requestType: 'params', type: request.sessionIdParamValidation }),
	requestValidator({ requestType: 'body', type: request.presignVideoUploadValidation }),
	requestHandler(controller.presignVideo)
);

router.post(
	'/sessions/:id_session/video/complete',
	requestValidator({ requestType: 'params', type: request.sessionIdParamValidation }),
	requestValidator({ requestType: 'body', type: request.completeVideoUploadValidation }),
	requestHandler(controller.completeVideo)
);

router.get(
	'/sessions/:id_session/video',
	requestValidator({ requestType: 'params', type: request.sessionIdParamValidation }),
	requestHandler(controller.getVideoUrl)
);

router.get('/share/:share_token', async (req, res, next) => {
	try {
		const token = req.params.share_token;
		const hostUrl = `${req.protocol}://${req.get('host')}`;
		const html = await renderShareHtml(token, hostUrl);
		res.setHeader('Content-Type', 'text/html; charset=utf-8');
		res.send(html);
	} catch (err) {
		next(err);
	}
});

export default router;
