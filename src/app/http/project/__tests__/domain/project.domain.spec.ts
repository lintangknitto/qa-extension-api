import {
	InvalidParameterException,
	NotAuthorizationException,
	NotFoundException
} from '@knittotextile/knitto-core-backend/dist/CoreException';
import * as domain from '../../domain/project.domain';

const ADMIN_LEVELS = ['ADMIN', 'QA', 'SUPERADMIN'];

describe('project.domain', () => {
	describe('slugifyProjectCode', () => {
		it('mengubah nama menjadi kode kebab-case', () => {
			expect(domain.slugifyProjectCode('Knitto Web App')).toBe('knitto-web-app');
		});

		it('membuang karakter non alfanumerik dan memangkas tanda hubung', () => {
			expect(domain.slugifyProjectCode('  QA -- Extension!!  ')).toBe('qa-extension');
		});

		it('membatasi panjang kode', () => {
			expect(domain.slugifyProjectCode('a'.repeat(120)).length).toBe(domain.PROJECT_CODE_MAX_LENGTH);
		});
	});

	describe('canManageProjects', () => {
		it('mengizinkan level admin tanpa peduli kapitalisasi', () => {
			expect(domain.canManageProjects('admin', ADMIN_LEVELS)).toBe(true);
			expect(domain.canManageProjects('QA', ADMIN_LEVELS)).toBe(true);
		});

		it('menolak level lain dan level kosong', () => {
			expect(domain.canManageProjects('IMPLEMENTOR', ADMIN_LEVELS)).toBe(false);
			expect(domain.canManageProjects(undefined, ADMIN_LEVELS)).toBe(false);
		});
	});

	describe('assertCanManageProjects', () => {
		it('melempar NotAuthorizationException untuk non-admin', () => {
			expect(() => domain.assertCanManageProjects('IMPLEMENTOR', ADMIN_LEVELS)).toThrow(
				NotAuthorizationException
			);
		});

		it('tidak melempar untuk admin', () => {
			expect(() => domain.assertCanManageProjects('ADMIN', ADMIN_LEVELS)).not.toThrow();
		});
	});

	describe('resolveProjectCode', () => {
		it('memakai code bila diberikan', () => {
			expect(domain.resolveProjectCode('Nama Panjang', 'kode-pendek')).toBe('kode-pendek');
		});

		it('menurunkan dari name bila code kosong', () => {
			expect(domain.resolveProjectCode('Knitto Web App', '   ')).toBe('knitto-web-app');
		});

		it('melempar untuk nama yang tidak bisa dijadikan kode', () => {
			expect(() => domain.resolveProjectCode('!!!')).toThrow(InvalidParameterException);
		});
	});

	describe('assertProjectExists', () => {
		it('melempar NotFoundException untuk null', () => {
			expect(() => domain.assertProjectExists(null)).toThrow(NotFoundException);
		});

		it('mengembalikan project yang ada', () => {
			const project: Entity.IQaProject = { id_project: 1, name: 'A' };
			expect(domain.assertProjectExists(project)).toBe(project);
		});
	});

	describe('normalizePagination', () => {
		it('memakai default saat tidak diberikan', () => {
			expect(domain.normalizePagination(undefined, undefined)).toEqual({ page: 0, perPage: 20, offset: 0 });
		});

		it('menghitung offset dan membatasi perPage maksimum', () => {
			expect(domain.normalizePagination(2, 500)).toEqual({ page: 2, perPage: 100, offset: 200 });
		});

		it('mengganti page negatif menjadi 0', () => {
			expect(domain.normalizePagination(-3, 10).page).toBe(0);
		});
	});

	describe('toProjectResponse', () => {
		it('mengubah is_active angka menjadi boolean', () => {
			const active = domain.toProjectResponse({ id_project: 1, is_active: 1 });
			const inactive = domain.toProjectResponse({ id_project: 2, is_active: 0 });

			expect(active.is_active).toBe(true);
			expect(inactive.is_active).toBe(false);
		});

		it('mengosongkan field yang tidak ada menjadi null', () => {
			const response = domain.toProjectResponse({ id_project: 1 });
			expect(response.name).toBeNull();
			expect(response.description).toBeNull();
			expect(response.base_url).toBeNull();
		});
	});
});
