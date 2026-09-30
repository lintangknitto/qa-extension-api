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

	describe('canManageSpecificProject & assertCanManageSpecificProject', () => {
		const sampleProject: Entity.IQaProject = {
			id_project: 10,
			name: 'Test Project',
			created_by_user_id: 3
		};

		it('mengizinkan SUPERADMIN dan ADMIN mengelola project apa pun', () => {
			expect(domain.canManageSpecificProject('SUPERADMIN', 99, sampleProject)).toBe(true);
			expect(domain.canManageSpecificProject('ADMIN', 99, sampleProject)).toBe(true);
			expect(() => domain.assertCanManageSpecificProject('SUPERADMIN', 99, sampleProject)).not.toThrow();
			expect(() => domain.assertCanManageSpecificProject('ADMIN', 99, sampleProject)).not.toThrow();
		});

		it('mengizinkan QA jika merupakan creator (created_by_user_id === userId)', () => {
			expect(domain.canManageSpecificProject('QA', 3, sampleProject)).toBe(true);
			expect(() => domain.assertCanManageSpecificProject('QA', 3, sampleProject)).not.toThrow();
		});

		it('menolak QA jika bukan creator', () => {
			expect(domain.canManageSpecificProject('QA', 4, sampleProject)).toBe(false);
			expect(() => domain.assertCanManageSpecificProject('QA', 4, sampleProject)).toThrow(
				NotAuthorizationException
			);
		});

		it('menolak IMPLEMENTOR dan VIEWER', () => {
			expect(domain.canManageSpecificProject('IMPLEMENTOR', 3, sampleProject)).toBe(false);
			expect(domain.canManageSpecificProject('VIEWER', 3, sampleProject)).toBe(false);
			expect(() => domain.assertCanManageSpecificProject('IMPLEMENTOR', 3, sampleProject)).toThrow(
				NotAuthorizationException
			);
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
		it('mengubah is_active angka menjadi boolean dan menyertakan created_by_user_id', () => {
			const active = domain.toProjectResponse({ id_project: 1, is_active: 1, created_by_user_id: 5 });
			const inactive = domain.toProjectResponse({ id_project: 2, is_active: 0 });

			expect(active.is_active).toBe(true);
			expect(active.created_by_user_id).toBe(5);
			expect(inactive.is_active).toBe(false);
			expect(inactive.created_by_user_id).toBeNull();
		});

		it('mengosongkan field yang tidak ada menjadi null', () => {
			const response = domain.toProjectResponse({ id_project: 1 });
			expect(response.name).toBeNull();
			expect(response.description).toBeNull();
			expect(response.base_url).toBeNull();
		});
	});
});
