import * as queries from '../../queries/test-case-template.queries';
import * as repo from '../../repo/test-case-template.repo';
import { listTemplatesUseCase } from '../../use-case/list-templates.use-case';
import { getDefaultTemplateUseCase } from '../../use-case/get-default-template.use-case';
import { createTemplateUseCase } from '../../use-case/create-template.use-case';
import { updateTemplateUseCase } from '../../use-case/update-template.use-case';
import { setDefaultTemplateUseCase } from '../../use-case/set-default-template.use-case';
import { deactivateTemplateUseCase } from '../../use-case/deactivate-template.use-case';
import { detailTemplateUseCase } from '../../use-case/detail-template.use-case';

jest.mock('../../queries/test-case-template.queries');
jest.mock('../../repo/test-case-template.repo');

const v4 = {
	id_template: 1,
	version_label: 'V4',
	name: 'FORMAT TEST CASE V4',
	spreadsheet_url: 'https://docs.google.com/spreadsheets/d/x/edit',
	gid: '1730053292',
	column_mapping: { test_case_id: { header: 'Test Case ID' }, title: { header: 'Test Case' } },
	export_anchors: {},
	is_default: true,
	is_active: true
};
const v5 = { ...v4, id_template: 2, version_label: 'V5', is_default: false };

const input = {
	version_label: 'V5',
	name: 'FORMAT TEST CASE V5',
	spreadsheet_url: 'https://docs.google.com/spreadsheets/d/x/edit',
	column_mapping: v4.column_mapping
};

describe('test-case-template use cases', () => {
	beforeEach(() => jest.clearAllMocks());

	it('list: user biasa hanya melihat template aktif walau minta include_inactive', async () => {
		(queries.findTemplates as jest.Mock).mockResolvedValue([v4]);
		await listTemplatesUseCase({ userLevel: 'QA', includeInactive: true });
		expect(queries.findTemplates).toHaveBeenCalledWith(false);
		await listTemplatesUseCase({ userLevel: 'ADMIN', includeInactive: true });
		expect(queries.findTemplates).toHaveBeenLastCalledWith(true);
	});

	it('get default: mengembalikan template default atau 404', async () => {
		(queries.findDefaultTemplate as jest.Mock).mockResolvedValueOnce(v4).mockResolvedValueOnce(null);
		await expect(getDefaultTemplateUseCase()).resolves.toMatchObject({ version_label: 'V4', is_default: true });
		await expect(getDefaultTemplateUseCase()).rejects.toThrow('Belum ada template test case default.');
	});

	it.each(['QA', 'IMPLEMENTOR', 'VIEWER', undefined])('menolak level %s untuk operasi kelola', async (level) => {
		await expect(detailTemplateUseCase({ userLevel: level, idTemplate: 1 })).rejects.toThrow('Hanya ADMIN/SUPERADMIN');
		await expect(createTemplateUseCase({ userLevel: level, input })).rejects.toThrow('Hanya ADMIN/SUPERADMIN');
		await expect(updateTemplateUseCase({ userLevel: level, idTemplate: 1, input: {} })).rejects.toThrow('Hanya ADMIN/SUPERADMIN');
		await expect(setDefaultTemplateUseCase({ userLevel: level, idTemplate: 1 })).rejects.toThrow('Hanya ADMIN/SUPERADMIN');
		await expect(deactivateTemplateUseCase({ userLevel: level, idTemplate: 1 })).rejects.toThrow('Hanya ADMIN/SUPERADMIN');
		expect(repo.insertTemplate).not.toHaveBeenCalled();
		expect(repo.updateTemplate).not.toHaveBeenCalled();
	});

	it('create: menyimpan template baru dan menolak versi duplikat', async () => {
		(queries.findTemplateByVersion as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce(v5);
		(repo.insertTemplate as jest.Mock).mockResolvedValue(2);
		(queries.findTemplateById as jest.Mock).mockResolvedValue(v5);

		await expect(createTemplateUseCase({ userId: 7, userLevel: 'ADMIN', input })).resolves.toMatchObject({ id_template: 2 });
		expect(repo.insertTemplate).toHaveBeenCalledWith(input, 7);
		await expect(createTemplateUseCase({ userId: 7, userLevel: 'ADMIN', input })).rejects.toThrow('Versi template sudah dipakai.');
	});

	it('update: menolak nonaktifkan default dan versi milik template lain', async () => {
		(queries.findTemplateById as jest.Mock).mockResolvedValue(v4);
		await expect(
			updateTemplateUseCase({ userLevel: 'ADMIN', idTemplate: 1, input: { is_active: false } })
		).rejects.toThrow('Template default tidak bisa dinonaktifkan');

		(queries.findTemplateByVersion as jest.Mock).mockResolvedValue(v5);
		await expect(
			updateTemplateUseCase({ userLevel: 'ADMIN', idTemplate: 1, input: { version_label: 'V5' } })
		).rejects.toThrow('Versi template sudah dipakai.');
		expect(repo.updateTemplate).not.toHaveBeenCalled();
	});

	it('set default: memindahkan default, menolak template nonaktif', async () => {
		(queries.findTemplateById as jest.Mock).mockResolvedValueOnce(v5).mockResolvedValueOnce({ ...v5, is_default: true });
		await expect(setDefaultTemplateUseCase({ userId: 7, userLevel: 'SUPERADMIN', idTemplate: 2 })).resolves.toMatchObject({
			is_default: true
		});
		expect(repo.setDefaultTemplate).toHaveBeenCalledWith(2, 7);

		(queries.findTemplateById as jest.Mock).mockResolvedValueOnce({ ...v5, is_active: false });
		await expect(setDefaultTemplateUseCase({ userLevel: 'ADMIN', idTemplate: 2 })).rejects.toThrow('Template nonaktif');
	});

	it('deactivate: menonaktifkan template non-default, 404 bila tidak ada', async () => {
		(queries.findTemplateById as jest.Mock).mockResolvedValueOnce(v5).mockResolvedValueOnce({ ...v5, is_active: false });
		await expect(deactivateTemplateUseCase({ userId: 7, userLevel: 'ADMIN', idTemplate: 2 })).resolves.toMatchObject({
			is_active: false
		});
		expect(repo.updateTemplate).toHaveBeenCalledWith(2, { is_active: false }, 7);

		(queries.findTemplateById as jest.Mock).mockResolvedValueOnce(null);
		await expect(deactivateTemplateUseCase({ userLevel: 'ADMIN', idTemplate: 9 })).rejects.toThrow('tidak ditemukan');
	});
});
