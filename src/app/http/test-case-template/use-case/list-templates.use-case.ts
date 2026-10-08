import * as domain from '../domain/test-case-template.domain';
import * as queries from '../queries/test-case-template.queries';

/** Semua user login boleh melihat template aktif; template nonaktif hanya untuk admin. */
export const listTemplatesUseCase = async (ctx: { userLevel: string | undefined; includeInactive: boolean }) => {
	const includeInactive = ctx.includeInactive && domain.canManageTemplates(ctx.userLevel);
	const rows = await queries.findTemplates(includeInactive);
	return rows.map(domain.toTemplateResponse);
};
