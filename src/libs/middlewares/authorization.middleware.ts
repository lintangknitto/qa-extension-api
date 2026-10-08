import jwt from 'jsonwebtoken';
import { ExpressType, sendResponse } from '@knittotextile/knitto-http';
import { APP_SECRET_KEY } from '@/libs/config';
import postgresConnection from '@/libs/config/postgresConnection';
import guestPath from '../config/guestPathHttp';

const authorizeMiddleware = (
	req: ExpressType.Request,
	res: ExpressType.Response,
	next: ExpressType.NextFunction
) => {
	const isGuest = guestPath.some((routePath) => {
		let validPath = req.path === routePath.path;

		if (routePath.withSubPath) {
			validPath = req.path.startsWith(routePath.path);
		}

		let validMethod = true;
		if (routePath.method.length > 0) {
			validMethod = routePath.method.includes(req.method.toLowerCase() as any);
		}

		return validPath && validMethod;
	});

	const isVideoStream = req.method.toLowerCase() === 'get' && req.path.includes('/video/stream');

	if (isGuest || isVideoStream) {
		next();
		return;
	}

	const tokenHeader = req.headers.authorization;
	if (!tokenHeader) {
		sendResponse(
			{
				status: 401,
				message: 'Authorization header missing or invalid token.'
			},
			res
		);
		return;
	}

	const token: string[] = tokenHeader.split(' ');
	switch (true) {
		case token === undefined:
			sendResponse(
				{
					status: 401,
					result: 'Authorization header missing or invalid token.'
				},
				res
			);
			break;
		case token.length < 2:
			sendResponse(
				{
					status: 401,
					result: 'Authorization header missing or invalid token.'
				},
				res
			);
			break;
		case token[0] !== 'Bearer':
			sendResponse({ status: 401, result: 'Invalid Token Format' }, res);
			break;
		case !token[1]:
			sendResponse({ status: 401, result: 'Invalid Token Format' }, res);
			break;
		default:
			jwt.verify(token[1], APP_SECRET_KEY, async (err: any, decode: any) => {
				if (err) {
					sendResponse(
						{ status: 401, result: 'Invalid Token or expired token.' },
						res
					);
				} else {
					const [user] = await postgresConnection.raw<
						Array<{
							id_user: number;
							nama: string;
							username: string;
							level: string;
							is_active: boolean | number;
						}>
					>(
						'SELECT id_user, nama, username, level, is_active FROM users WHERE id_user = ? LIMIT 1',
						[decode.id_user]
					);

					if (!user || (user.is_active !== undefined && (user.is_active === false || Number(user.is_active) === 0))) {
						sendResponse(
							{
								status: 401,
								result:
									'Invalid token claims: The token contains invalid or mismatched claims.'
							},
							res
						);
						return;
					}

					req.userId = decode.id_user;
					req.userData = user;
					next();
				}
			});
			break;
	}
};

export default authorizeMiddleware;
