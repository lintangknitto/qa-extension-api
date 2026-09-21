import { InvalidParameterException, NotFoundException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import type { TCreateSessionValidation } from '../session.request';
import * as domain from '../domain/session.domain';
import * as queries from '../queries/session.queries';
import * as repo from '../repo/session.repo';
import { findProjectById } from '../../project/queries/project.queries';

export const createSessionUseCase = async (ctx: {
	userId: number;
	input: TCreateSessionValidation;
}) => {
	const project = await findProjectById(ctx.input.id_project);
	if (!project) throw new NotFoundException('Project tidak ditemukan.');
	if (project.is_active !== 1) throw new InvalidParameterException('Project tidak aktif.');

	const active = await queries.findActiveSessionByOwner(ctx.userId);
	if (active)
		throw new InvalidParameterException(
			'Masih ada session recording aktif. Akhiri session tersebut sebelum memulai yang baru.'
		);

	const idSession = await repo.insertSession({
		idProject: ctx.input.id_project,
		testCaseNo: ctx.input.test_case_no,
		title: ctx.input.title,
		description: ctx.input.description ?? null,
		targetUrl: ctx.input.target_url ?? null,
		ownerUserId: ctx.userId
	});

	const created = domain.assertSessionExists(await queries.findSessionById(idSession));
	return domain.toSessionResponse(created);
};
