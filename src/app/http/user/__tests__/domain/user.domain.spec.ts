import * as domain from '../../domain/user.domain';
import {
	InvalidParameterException,
	NotFoundException,
	NotAuthorizationException
} from '@knittotextile/knitto-core-backend/dist/CoreException';

describe('user.domain', () => {
	describe('normalizeUserLevel', () => {
		it('should normalize valid roles in uppercase', () => {
			expect(domain.normalizeUserLevel('superadmin')).toBe('SUPERADMIN');
			expect(domain.normalizeUserLevel('admin')).toBe('ADMIN');
			expect(domain.normalizeUserLevel('QA')).toBe('QA');
			expect(domain.normalizeUserLevel('implementor')).toBe('IMPLEMENTOR');
			expect(domain.normalizeUserLevel('viewer')).toBe('VIEWER');
		});

		it('should default to QA for unknown or empty roles', () => {
			expect(domain.normalizeUserLevel('')).toBe('QA');
			expect(domain.normalizeUserLevel(undefined)).toBe('QA');
			expect(domain.normalizeUserLevel('UNKNOWN')).toBe('QA');
		});
	});

	describe('assertUserExists', () => {
		it('should not throw if user exists', () => {
			expect(() => domain.assertUserExists({ id_user: 1 })).not.toThrow();
		});

		it('should throw NotFoundException if user is null', () => {
			expect(() => domain.assertUserExists(null)).toThrow(NotFoundException);
		});
	});

	describe('assertUniqueUsername', () => {
		it('should not throw when existingUser is null', () => {
			expect(() => domain.assertUniqueUsername(null)).not.toThrow();
		});

		it('should not throw when existingUser belongs to current user', () => {
			expect(() => domain.assertUniqueUsername({ id_user: 5 }, 5)).not.toThrow();
		});

		it('should throw InvalidParameterException when username belongs to different user', () => {
			expect(() => domain.assertUniqueUsername({ id_user: 7 }, 5)).toThrow(InvalidParameterException);
		});
	});

	describe('assertCanManageTargetUser', () => {
		it('should allow SUPERADMIN to manage any user and promote to any level', () => {
			expect(() => domain.assertCanManageTargetUser('SUPERADMIN', 'SUPERADMIN', 'ADMIN')).not.toThrow();
			expect(() => domain.assertCanManageTargetUser('SUPERADMIN', 'QA', 'SUPERADMIN')).not.toThrow();
		});

		it('should allow ADMIN to manage non-superadmin users', () => {
			expect(() => domain.assertCanManageTargetUser('ADMIN', 'QA', 'IMPLEMENTOR')).not.toThrow();
			expect(() => domain.assertCanManageTargetUser('ADMIN', 'VIEWER', 'QA')).not.toThrow();
		});

		it('should prevent ADMIN from managing SUPERADMIN target', () => {
			expect(() => domain.assertCanManageTargetUser('ADMIN', 'SUPERADMIN', 'QA')).toThrow(NotAuthorizationException);
		});

		it('should prevent ADMIN from assigning SUPERADMIN role to any user', () => {
			expect(() => domain.assertCanManageTargetUser('ADMIN', 'QA', 'SUPERADMIN')).toThrow(NotAuthorizationException);
		});

		it('should reject non-admin actors', () => {
			expect(() => domain.assertCanManageTargetUser('QA', 'QA')).toThrow(NotAuthorizationException);
			expect(() => domain.assertCanManageTargetUser('VIEWER', 'VIEWER')).toThrow(NotAuthorizationException);
			expect(() => domain.assertCanManageTargetUser(undefined, 'QA')).toThrow(NotAuthorizationException);
		});
	});

	describe('toUserListItemResponse and toUserDetailResponse', () => {
		it('should map user correctly to response shape', () => {
			const user = {
				id_user: 1,
				nama: 'Jane Doe',
				username: 'janedoe',
				level: 'QA',
				is_active: 1,
				created_at: '2026-09-29 10:00:00',
				updated_at: '2026-09-29 10:00:00'
			};

			const item = domain.toUserListItemResponse(user);
			expect(item).toEqual({
				id_user: 1,
				nama: 'Jane Doe',
				username: 'janedoe',
				level: 'QA',
				is_active: true,
				created_at: '2026-09-29 10:00:00',
				updated_at: '2026-09-29 10:00:00'
			});

			const detail = domain.toUserDetailResponse(user, [10, 20]);
			expect(detail.assigned_project_ids).toEqual([10, 20]);
		});
	});
});
