import jwt from 'jsonwebtoken';
import { ExpressType, sendResponse } from '@knittotextile/knitto-http';
import { APP_SECRET_KEY } from '@/libs/config';
import mysqlConnection from '@/libs/config/mysqlConnection';
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

	if (isGuest) {
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
					const [user] = await mysqlConnection.raw<
						Array<{
							id_user: number;
							nama: string;
							username: string;
							level: string;
						}>
					>(
						'SELECT id_user, nama, username, level FROM user WHERE id_user = ?',
						[decode.id_user]
					);

					if (!user) {
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
