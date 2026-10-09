import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import type { TUpdateTemplateValidation } from '../test-case-template.request';
import * as domain from '../domain/test-case-template.domain';
import * as queries from '../queries/test-case-template.queries';
import * as repo from '../repo/test-case-template.repo';

export const updateTemplateUseCase = async (ctx: {
	userId?: number;
	userLevel: string | undefined;
	idTemplate: number;
	input: TUpdateTemplateValidation;
}) => {
	domain.assertCanManageTemplates(ctx.userLevel);
	const current = domain.assertTemplateExists(await queries.findTemplateById(ctx.idTemplate));

	if (ctx.input.is_active === false) domain.assertCanDeactivate(current);
	if (ctx.input.version_label !== undefined) {
		const duplicate = await queries.findTemplateByVersion(ctx.input.version_label);
		if (duplicate && Number(duplicate.id_template) !== ctx.idTemplate)
			throw new InvalidParameterException('Versi template sudah dipakai.');
	}

	await repo.updateTemplate(ctx.idTemplate, ctx.input, ctx.userId);
	return domain.toTemplateResponse(domain.assertTemplateExists(await queries.findTemplateById(ctx.idTemplate)));
};
