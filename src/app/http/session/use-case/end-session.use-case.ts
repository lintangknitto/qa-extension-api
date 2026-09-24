import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import type { TEndSessionValidation } from '../session.request';
import * as domain from '../domain/session.domain';
import * as queries from '../queries/session.queries';
import * as repo from '../repo/session.repo';

import * as tcRepo from '../../test-case/repo/test-case.repo';

export const endSessionUseCase = async (ctx: {
	userId: number;
	userLevel: string | undefined;
	idSession: number;
	input: TEndSessionValidation;
}) => {
	const session = domain.assertSessionExists(await queries.findSessionById(ctx.idSession));
	domain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);
	domain.assertSessionIsRecording(session);

	const result = domain.assertValidSessionResult(ctx.input.result);
	await repo.completeSession(ctx.idSession, result, ctx.input.actual_result ?? null);

	if (session.id_test_case) {
		let testCaseStatus = 'Passed';
		if (result === 'FAIL') testCaseStatus = 'Failed';
		else if (result === 'BLOCKED') testCaseStatus = 'Re-Test';

		await tcRepo.updateTestCaseStatusAndEvidence(
			Number(session.id_test_case),
			testCaseStatus,
			ctx.input.actual_result ?? null,
			ctx.idSession
		);
	}

	const updated = domain.assertSessionExists(await queries.findSessionById(ctx.idSession));

	// Session selesai meski generation AI belum dijalankan/berhasil.
	return domain.toSessionResponse(updated);
};
