import { Router, requestHandler, requestValidator } from '@knittotextile/knitto-http';
import controller from './session.controller';
import request from './session.request';
import { renderShareHtml } from './use-case/render-share-page';
import { streamSessionVideoUseCase, streamSharedSessionVideoUseCase, type TVideoStream } from './use-case/session-video.use-case';
import type { Response } from 'express';

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
	['/sessions/active', '/api/v1/sessions/active'],
	requestHandler(controller.getActive)
);

router.post(
	['/sessions/active/discard', '/api/v1/sessions/active/discard', '/sessions/discard-active'],
	requestHandler(controller.discardActive)
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
	['/sessions/:id_session/video/upload', '/api/v1/sessions/:id_session/video/upload'],
	requestValidator({ requestType: 'params', type: request.sessionIdParamValidation }),
	requestHandler(controller.uploadVideoDirect)
);

router.post(
	['/sessions/:id_session/video/presign-upload', '/api/v1/sessions/:id_session/video/presign-upload'],
	requestValidator({ requestType: 'params', type: request.sessionIdParamValidation }),
	requestValidator({ requestType: 'body', type: request.presignVideoUploadValidation }),
	requestHandler(controller.presignVideo)
);

router.post(
	['/sessions/:id_session/video/complete', '/api/v1/sessions/:id_session/video/complete'],
	requestValidator({ requestType: 'params', type: request.sessionIdParamValidation }),
	requestValidator({ requestType: 'body', type: request.completeVideoUploadValidation }),
	requestHandler(controller.completeVideo)
);

router.get(
	['/sessions/:id_session/video', '/api/v1/sessions/:id_session/video'],
	requestValidator({ requestType: 'params', type: request.sessionIdParamValidation }),
	requestHandler(controller.getVideoUrl)
);

/** Kirim video dengan dukungan HTTP Range (206) agar seek/scrub di `<video>` berfungsi. */
const sendVideo = (res: Response, video: TVideoStream) => {
	res.setHeader('Content-Type', video.contentType);
	res.setHeader('Accept-Ranges', 'bytes');
	res.setHeader('Access-Control-Allow-Origin', '*');
	if (video.kind === 'unsatisfiable') {
		res.status(416).setHeader('Content-Range', `bytes */${video.size}`);
		res.end();
		return;
	}
	if (video.kind === 'partial') {
		res.status(206);
		res.setHeader('Content-Range', `bytes ${video.range.start}-${video.range.end}/${video.size}`);
		res.setHeader('Content-Length', video.range.end - video.range.start + 1);
	} else {
		res.setHeader('Content-Length', video.size);
	}
	video.stream.pipe(res);
};

router.get(
	['/sessions/:id_session/video/stream', '/api/v1/sessions/:id_session/video/stream'],
	async (req, res, next) => {
		try {
			const idSession = Number(req.params.id_session);
			sendVideo(res, await streamSessionVideoUseCase({ idSession, range: req.headers.range }));
		} catch (err) {
			next(err);
		}
	}
);

// Video halaman share: lewat API + share token, bukan URL presigned MinIO (host internal & kedaluwarsa).
router.get('/share/:share_token/video', async (req, res, next) => {
	try {
		sendVideo(res, await streamSharedSessionVideoUseCase({ shareToken: req.params.share_token, range: req.headers.range }));
	} catch (err) {
		next(err);
	}
});

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

