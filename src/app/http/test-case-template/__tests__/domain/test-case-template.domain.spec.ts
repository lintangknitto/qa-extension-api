import { safeParse } from 'valibot';
import {
	assertCanDeactivate,
	assertCanManageTemplates,
	canManageTemplates,
	toTemplateResponse
} from '../../domain/test-case-template.domain';
import { createTemplateValidation, updateTemplateValidation } from '../../test-case-template.request';

const validInput = {
	version_label: 'V5',
	name: 'FORMAT TEST CASE V5',
	spreadsheet_url: 'https://docs.google.com/spreadsheets/d/abc_DEF-123/edit',
	gid: '42',
	column_mapping: {
		test_case_id: { header: 'TC ID', aliases: ['id'] },
		title: { header: 'Kasus Uji' }
	}
};

describe('test-case-template domain', () => {
	it('hanya ADMIN/SUPERADMIN yang boleh mengelola template', () => {
		expect(canManageTemplates('ADMIN')).toBe(true);
		expect(canManageTemplates('superadmin')).toBe(true);
		expect(canManageTemplates('QA')).toBe(false);
		expect(canManageTemplates(undefined)).toBe(false);
		expect(() => assertCanManageTemplates('QA')).toThrow('Hanya ADMIN/SUPERADMIN');
	});

	it('menolak menonaktifkan template default', () => {
		expect(() => assertCanDeactivate({ is_default: true })).toThrow('Template default tidak bisa dinonaktifkan');
		expect(() => assertCanDeactivate({ is_default: false })).not.toThrow();
	});

	it('toTemplateResponse mem-parse JSONB string maupun object', () => {
		const res = toTemplateResponse({
			id_template: '3' as unknown as number,
			version_label: 'V4',
			column_mapping: '{"title":{"header":"Test Case"}}' as unknown as Record<string, { header: string }>,
			export_anchors: { header_row: 18 },
			is_default: true,
			is_active: true
		});
		expect(res.id_template).toBe(3);
		expect(res.column_mapping).toEqual({ title: { header: 'Test Case' } });
		expect(res.export_anchors).toEqual({ header_row: 18 });
	});
});

describe('test-case-template validation', () => {
	it('menerima template valid', () => {
		expect(safeParse(createTemplateValidation, validInput).success).toBe(true);
	});

	it('pemetaan wajib punya test_case_id dan title', () => {
		const res = safeParse(createTemplateValidation, {
			...validInput,
			column_mapping: { test_case_id: { header: 'TC ID' } }
		});
		expect(res.success).toBe(false);
		expect(res.issues?.[0].message).toContain('test_case_id dan title');
	});

	it('menolak field pemetaan tak dikenal, header kosong, dan URL bukan Google Sheets', () => {
		expect(
			safeParse(createTemplateValidation, {
				...validInput,
				column_mapping: { ...validInput.column_mapping, foo: { header: 'Foo' } }
			}).success
		).toBe(false);
		expect(
			safeParse(createTemplateValidation, {
				...validInput,
				column_mapping: { ...validInput.column_mapping, title: { header: '  ' } }
			}).success
		).toBe(false);
		expect(safeParse(createTemplateValidation, { ...validInput, spreadsheet_url: 'https://evil.example/x' }).success).toBe(false);
		expect(safeParse(createTemplateValidation, { ...validInput, gid: 'abc' }).success).toBe(false);
	});

	it('update parsial tetap memvalidasi pemetaan bila dikirim', () => {
		expect(safeParse(updateTemplateValidation, { name: 'Baru' }).success).toBe(true);
		expect(safeParse(updateTemplateValidation, { column_mapping: { title: { header: 'X' } } }).success).toBe(false);
	});
});
