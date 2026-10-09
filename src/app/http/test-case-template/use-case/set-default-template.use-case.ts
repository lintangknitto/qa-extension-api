import * as domain from '../domain/test-case-template.domain';
import * as queries from '../queries/test-case-template.queries';
import * as repo from '../repo/test-case-template.repo';

export const setDefaultTemplateUseCase = async (ctx: { userId?: number; userLevel: string | undefined; idTemplate: number }) => {
	domain.assertCanManageTemplates(ctx.userLevel);
	domain.assertCanSetDefault(domain.assertTemplateExists(await queries.findTemplateById(ctx.idTemplate)));

	await repo.setDefaultTemplate(ctx.idTemplate, ctx.userId);
	return domain.toTemplateResponse(domain.assertTemplateExists(await queries.findTemplateById(ctx.idTemplate)));
};
