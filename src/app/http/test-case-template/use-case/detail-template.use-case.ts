import * as domain from '../domain/test-case-template.domain';
import * as queries from '../queries/test-case-template.queries';

export const detailTemplateUseCase = async (ctx: { userLevel: string | undefined; idTemplate: number }) => {
	domain.assertCanManageTemplates(ctx.userLevel);
	return domain.toTemplateResponse(domain.assertTemplateExists(await queries.findTemplateById(ctx.idTemplate)));
};
