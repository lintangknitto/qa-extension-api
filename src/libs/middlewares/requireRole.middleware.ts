import { ExpressType, sendResponse } from '@knittotextile/knitto-http';

/**
 * Middleware untuk membatasi akses endpoint berdasarkan role level pengguna yang terautentikasi.
 */
export const requireRole = (allowedRoles: readonly string[]) => {
	const normalizedAllowed = allowedRoles.map((r) => r.toUpperCase());

	return (
		req: ExpressType.Request,
		res: ExpressType.Response,
		next: ExpressType.NextFunction
	) => {
		const userLevel = req.userData?.level?.toUpperCase();

		if (!userLevel || !normalizedAllowed.includes(userLevel)) {
			sendResponse(
				{
					status: 403,
					message: 'Akses ditolak: Anda tidak memiliki izin untuk mengakses resource ini.'
				},
				res
			);
			return;
		}

		next();
	};
};
