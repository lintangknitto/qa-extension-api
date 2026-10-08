import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import type { TCreateTemplateValidation } from '../test-case-template.request';
import * as domain from '../domain/test-case-template.domain';
import * as queries from '../queries/test-case-template.queries';
import * as repo from '../repo/test-case-template.repo';

export const createTemplateUseCase = async (ctx: {
	userId?: number;
	userLevel: string | undefined;
	input: TCreateTemplateValidation;
}) => {
	domain.assertCanManageTemplates(ctx.userLevel);
	if (await queries.findTemplateByVersion(ctx.input.version_label))
		throw new InvalidParameterException('Versi template sudah dipakai.');

	const idTemplate = await repo.insertTemplate(ctx.input, ctx.userId);
	return domain.toTemplateResponse(domain.assertTemplateExists(await queries.findTemplateById(idTemplate)));
};
