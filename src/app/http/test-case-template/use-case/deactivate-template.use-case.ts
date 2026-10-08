import * as domain from '../domain/test-case-template.domain';
import * as queries from '../queries/test-case-template.queries';
import * as repo from '../repo/test-case-template.repo';

export const deactivateTemplateUseCase = async (ctx: { userId?: number; userLevel: string | undefined; idTemplate: number }) => {
	domain.assertCanManageTemplates(ctx.userLevel);
	domain.assertCanDeactivate(domain.assertTemplateExists(await queries.findTemplateById(ctx.idTemplate)));

	await repo.updateTemplate(ctx.idTemplate, { is_active: false }, ctx.userId);
	return domain.toTemplateResponse(domain.assertTemplateExists(await queries.findTemplateById(ctx.idTemplate)));
};
