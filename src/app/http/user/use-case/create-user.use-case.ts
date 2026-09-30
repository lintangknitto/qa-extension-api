import * as queries from '../queries/user.queries';
import * as repo from '../repo/user.repo';
import * as domain from '../domain/user.domain';
import { hashPassword } from '@/libs/helpers/password';
import { TCreateUserValidation } from '../user.request';

export const createUserUseCase = async (ctx: {
	actorLevel?: string;
	actorUserId?: number;
	body: TCreateUserValidation;
}) => {
	const normalizedLevel = domain.normalizeUserLevel(ctx.body.level);
	domain.assertCanManageTargetUser(ctx.actorLevel, undefined, normalizedLevel);

	const existing = await queries.findUserByUsername(ctx.body.username.trim());
	domain.assertUniqueUsername(existing);

	const hashedPassword = await hashPassword(ctx.body.password);
	const isActive = ctx.body.is_active === false ? 0 : 1;

	const insertId = await repo.insertUser({
		nama: ctx.body.nama.trim(),
		username: ctx.body.username.trim(),
		password: hashedPassword,
		level: normalizedLevel,
		is_active: isActive
	});

	const assignedProjectIds = ctx.body.project_ids ?? [];
	if (assignedProjectIds.length > 0) {
		await repo.setUserAssignedProjects(insertId, assignedProjectIds, ctx.actorUserId);
	}

	const createdUser = await queries.findUserById(insertId);
	domain.assertUserExists(createdUser);

	return domain.toUserDetailResponse(createdUser, assignedProjectIds);
};
