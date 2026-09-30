import { ExpressType } from '@knittotextile/knitto-http';
import * as queries from '../queries/auth.queries';
import * as domain from '../domain/auth.domain';
import { verifyPassword, hashPassword } from '@/libs/helpers/password';

export const loginUseCase = async (ctx: {
	req: ExpressType.Request;
	username: string;
	password: string;
}) => {
	const user = await queries.getUserByUsername(ctx.username);
	domain.validateUser(user);

	// Type narrowing
	const validUser = user;

	const { valid, needsUpgrade } = await verifyPassword(ctx.password, validUser.password);
	domain.validatePasswordMatch(valid);

	// Auto-upgrade legacy hash (MD5) ke Bcrypt jika valid
	if (needsUpgrade && validUser.id_user) {
		try {
			const upgradedHash = await hashPassword(ctx.password);
			await queries.updateUserPassword(validUser.id_user, upgradedHash);
		} catch {
			// Auto-upgrade legacy hash failed silently
		}
	}

	const token = domain.generateToken(validUser);
	const userResponse = domain.transformUserResponse(validUser);

	return {
		user: userResponse,
		token
	};
};
