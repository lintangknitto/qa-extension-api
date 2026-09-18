import { ExpressType } from '@knittotextile/knitto-http';
import * as queries from '../queries/auth.queries';
import * as domain from '../domain/auth.domain';

export const loginUseCase = async (ctx: {
	req: ExpressType.Request;
	username: string;
	password: string;
}) => {
	const user = await queries.getUserByUsernameAndPassword(ctx.username, ctx.password);
	domain.validateUser(user);

	// After validateUser, user is guaranteed to be non-null (validateUser throws if null)
	// TypeScript type narrowing
	const validUser = user;

	const token = domain.generateToken(validUser);
	const userResponse = domain.transformUserResponse(validUser);

	return {
		user: userResponse,
		token
	};
};
