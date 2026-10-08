import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import {
	slugifyProgramCode,
	assertValidProgramCode,
	resolveProgramCode,
	normalizeProgramType,
	canManagePrograms,
	assertCanManagePrograms,
	canManageSpecificProgram,
	assertCanManageSpecificProgram,
	assertProgramExists,
	toProgramResponse
} from '../../domain/program.domain';

describe('program.domain', () => {
	describe('slugifyProgramCode', () => {
		it('mengubah string menjadi slug huruf kecil dan tanda hubung', () => {
			expect(slugifyProgramCode('Knitto Portal Staging')).toBe('knitto-portal-staging');
			expect(slugifyProgramCode('  ERP System 2026!  ')).toBe('erp-system-2026');
		});
	});

	describe('assertValidProgramCode', () => {
		it('menerima format kode program yang valid', () => {
			expect(() => assertValidProgramCode('knitto-portal')).not.toThrow();
			expect(() => assertValidProgramCode('portal-v2')).not.toThrow();
		});

		it('menolak kode program dengan karakter tidak valid atau spasi', () => {
			expect(() => assertValidProgramCode('portal invalid')).toThrow();
			expect(() => assertValidProgramCode('portal_v2')).toThrow();
		});
	});

	describe('resolveProgramCode', () => {
		it('menggunakan code jika diberikan', () => {
			expect(resolveProgramCode('Knitto Portal', 'portal-app')).toBe('portal-app');
		});

		it('menurunkan dari name jika code tidak diberikan', () => {
			expect(resolveProgramCode('Knitto Portal')).toBe('knitto-portal');
		});
	});

	describe('canManagePrograms & canManageSpecificProgram', () => {
		it('SUPERADMIN dan ADMIN dapat mengelola semua program', () => {
			expect(canManagePrograms('SUPERADMIN', PROJECT_ADMIN_LEVELS)).toBe(true);
			expect(canManagePrograms('ADMIN', PROJECT_ADMIN_LEVELS)).toBe(true);
			expect(canManageSpecificProgram('SUPERADMIN', 1, { created_by_user_id: 99 })).toBe(true);
			expect(canManageSpecificProgram('ADMIN', 2, { created_by_user_id: 99 })).toBe(true);
			expect(() => assertCanManagePrograms('ADMIN', PROJECT_ADMIN_LEVELS)).not.toThrow();
			expect(() => assertCanManagePrograms('GUEST', PROJECT_ADMIN_LEVELS)).toThrow();
		});

		it('QA Tester hanya dapat mengelola program buatannya sendiri', () => {
			expect(canManageSpecificProgram('QA', 10, { created_by_user_id: 10 })).toBe(true);
			expect(canManageSpecificProgram('QA', 10, { created_by_user_id: 11 })).toBe(false);
		});

		it('assertCanManageSpecificProgram melempar exception jika tidak berwenang', () => {
			expect(() =>
				assertCanManageSpecificProgram('QA', 10, { created_by_user_id: 11 })
			).toThrow();
		});
	});

	describe('normalizeProgramType', () => {
		it('mengembalikan FRONTEND untuk nilai default atau kosong', () => {
			expect(normalizeProgramType(undefined)).toBe('FRONTEND');
			expect(normalizeProgramType(null)).toBe('FRONTEND');
			expect(normalizeProgramType('')).toBe('FRONTEND');
		});

		it('mengembalikan SERVICE untuk service, backend, atau api', () => {
			expect(normalizeProgramType('SERVICE')).toBe('SERVICE');
			expect(normalizeProgramType('service')).toBe('SERVICE');
			expect(normalizeProgramType('backend')).toBe('SERVICE');
			expect(normalizeProgramType('api')).toBe('SERVICE');
		});
	});

	describe('assertProgramExists & toProgramResponse', () => {
		it('assertProgramExists melempar NotFoundException jika null', () => {
			expect(() => assertProgramExists(null)).toThrow('Program tidak ditemukan.');
		});

		it('toProgramResponse memformat objek program dengan benar', () => {
			const res = toProgramResponse({
				id_program: 1,
				name: 'Knitto Portal',
				code: 'knitto-portal',
				type: 'SERVICE',
				grafana_dashboard_url: 'http://192.168.20.15:3800/d/portal-kpi',
				description: 'Portal Knitto',
				base_url: 'https://staging.portal.knitto.id',
				repo_url: 'https://github.com/knittotextile/knitto-portal',
				project_count: 5,
				is_active: true,
				created_by_user_id: 2,
				created_at: '2026-09-30T00:00:00Z',
				updated_at: '2026-09-30T00:00:00Z'
			});
			expect(res.id_program).toBe(1);
			expect(res.code).toBe('knitto-portal');
			expect(res.type).toBe('SERVICE');
			expect(res.grafana_dashboard_url).toBe('http://192.168.20.15:3800/d/portal-kpi');
			expect(res.project_count).toBe(5);
			expect(res.is_active).toBe(true);
		});
	});
});
