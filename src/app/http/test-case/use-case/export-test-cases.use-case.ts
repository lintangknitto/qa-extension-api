import {
	InvalidParameterException,
	NotAuthorizationException,
	NotFoundException
} from '@knittotextile/knitto-core-backend/dist/CoreException';
import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import { findProjectById } from '../../project/queries/project.queries';
import { canManageProjects } from '../../project/domain/project.domain';
import { getUserAssignedProjectIds } from '../../user/queries/user.queries';
import { findDefaultTemplate, findTemplateById } from '../../test-case-template/queries/test-case-template.queries';
import { toTemplateResponse } from '../../test-case-template/domain/test-case-template.domain';
import * as queries from '../queries/test-case.queries';
import { fillTemplateWorksheet, type IExportAnchors } from '../domain/test-case-export';
import { downloadTemplateWorkbook } from '../services/template-workbook.service';

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Aturan sama dengan daftar project aktif: admin global, atau project yang di-assign (user tanpa assignment melihat semua). */
const assertCanAccessProject = async (project: Entity.IQaProject, userId: number | undefined, userLevel: string | undefined) => {
	const isActive = project.is_active === true || project.is_active === 1;
	if (!isActive && !canManageProjects(userLevel, PROJECT_ADMIN_LEVELS))
		throw new NotAuthorizationException('Project nonaktif hanya bisa diekspor QA/admin.');
	const isGlobalAdmin = !!userLevel && ['SUPERADMIN', 'ADMIN'].includes(userLevel.toUpperCase());
	if (isGlobalAdmin || userId === undefined) return;

	const assigned = await getUserAssignedProjectIds(userId);
	if (assigned.length > 0 && !assigned.includes(Number(project.id_project)))
		throw new NotAuthorizationException('Anda tidak memiliki akses ke project ini.');
};

const resolveTemplate = async (idTemplate: number | undefined) => {
	const template = idTemplate ? await findTemplateById(idTemplate) : await findDefaultTemplate();
	if (!template) throw new NotFoundException(idTemplate ? 'Template test case tidak ditemukan.' : 'Belum ada template test case default.');
	if (template.is_active === false) throw new InvalidParameterException('Template test case nonaktif.');
	return toTemplateResponse(template);
};

const safeFilePart = (value: string): string => value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'template';

export const exportTestCasesUseCase = async (ctx: {
	idProject: number;
	idTemplate?: number;
	userId?: number;
	userLevel?: string;
}): Promise<{ buffer: Buffer; filename: string; contentType: string }> => {
	const project = await findProjectById(ctx.idProject);
	if (!project) throw new NotFoundException('Project tidak ditemukan.');
	await assertCanAccessProject(project, ctx.userId, ctx.userLevel);

	const template = await resolveTemplate(ctx.idTemplate);
	const testCases = await queries.findTestCasesByProject(ctx.idProject);
	const anchors = template.export_anchors as IExportAnchors;

	const { workbook, worksheet } = await downloadTemplateWorkbook({
		spreadsheet_url: template.spreadsheet_url,
		column_mapping: template.column_mapping,
		export_anchors: anchors
	});
	fillTemplateWorksheet({ worksheet, columnMapping: template.column_mapping, anchors, project, testCases });
	workbook.calcProperties.fullCalcOnLoad = true;

	return {
		buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
		filename: `${safeFilePart(project.code ?? `project-${ctx.idProject}`)}-test-case-${safeFilePart(template.version_label)}.xlsx`,
		contentType: XLSX_CONTENT_TYPE
	};
};
