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
	if (ctx.input.id_project) {
		const project = await findProjectById(ctx.input.id_project);
		if (!project) throw new NotFoundException('Project tidak ditemukan.');
		const isProjectActive = project.is_active === true || project.is_active === 1 || project.is_active === undefined;
		if (!isProjectActive) throw new InvalidParameterException('Project tidak aktif.');
	}

	const active = await queries.findActiveSessionByOwner(ctx.userId);
	if (active) {
		if (ctx.input.force_end_previous) {
			await repo.discardActiveSessionsByOwner(ctx.userId);
		} else {
			throw new InvalidParameterException(
				'Masih ada session recording aktif. Akhiri session tersebut sebelum memulai yang baru.'
			);
		}
	}

	const idSession = await repo.insertSession({
		idProject: ctx.input.id_project ?? null,
		idTestCase: ctx.input.id_test_case ?? null,
		testCaseNo: ctx.input.test_case_no,
		title: ctx.input.title,
		description: ctx.input.description ?? null,
		targetUrl: ctx.input.target_url ?? null,
		ownerUserId: ctx.userId
	});

	const created = domain.assertSessionExists(await queries.findSessionById(idSession));
	return domain.toSessionResponse(created);
};
