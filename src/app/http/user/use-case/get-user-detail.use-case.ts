import * as queries from '../queries/user.queries';
import * as domain from '../domain/user.domain';

export const getUserDetailUseCase = async (idUser: number) => {
	const user = await queries.findUserById(idUser);
	domain.assertUserExists(user);

	const assignedProjectIds = await queries.getUserAssignedProjectIds(idUser);
	return domain.toUserDetailResponse(user, assignedProjectIds);
};
