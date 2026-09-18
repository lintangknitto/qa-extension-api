import { ExpressType } from '@knittotextile/knitto-http';
import * as repo from '../repo/auth.repo';

export const logoutUseCase = async (ctx: {
	req: ExpressType.Request;
	userId: number;
}) => {
	await repo.updateUserLogout(ctx.userId);
	await repo.updatePrinterLogout(ctx.userId);
	return {};
};
