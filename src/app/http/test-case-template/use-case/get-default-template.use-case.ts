import { NotFoundException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import * as domain from '../domain/test-case-template.domain';
import * as queries from '../queries/test-case-template.queries';

export const getDefaultTemplateUseCase = async () => {
	const template = await queries.findDefaultTemplate();
	if (!template) throw new NotFoundException('Belum ada template test case default.');
	return domain.toTemplateResponse(template);
};
