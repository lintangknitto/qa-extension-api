import * as domain from '../../domain/auth.domain';
import { InvalidParameterException, NotAuthorizationException } from '@knittotextile/knitto-core-backend/dist/CoreException';

describe('auth.domain', () => {
	describe('generateToken', () => {
		it('should generate valid JWT token', () => {
			const user = {
				id_user: 1,
				nama: 'Test User',
				username: 'testuser',
				level: 'IMPLEMENTOR'
			} as const satisfies Partial<Entity.IUser> as Entity.IUser;

			const token = domain.generateToken(user);

			expect(token).toBeDefined();
			expect(typeof token).toBe('string');
			expect(token.split('.').length).toBe(3); // JWT has 3 parts
		});
	});

	describe('transformUserResponse', () => {
		it('should transform user to response format', () => {
			const user = {
				id_user: 1,
				nama: 'Test User',
				username: 'testuser',
				level: 'IMPLEMENTOR',
				is_active: 1
			} as const satisfies Partial<Entity.IUser> as Entity.IUser;

			const result = domain.transformUserResponse(user);

			expect(result).toEqual({
				id_user: 1,
				nama: 'Test User',
				username: 'testuser',
				level: 'IMPLEMENTOR',
				is_active: true,
				input: 'enable'
			});
		});

		it('should set input to disable for non-IMPLEMENTOR', () => {
			const user = {
				id_user: 1,
				nama: 'Test User',
				username: 'testuser',
				level: 'USER',
				is_active: 1
			} as const satisfies Partial<Entity.IUser> as Entity.IUser;

			const result = domain.transformUserResponse(user);

			expect(result.input).toBe('disable');
			expect(result.is_active).toBe(true);
		});
	});

	describe('validateUser', () => {
		it('should not throw for valid user', () => {
			const user = {
				id_user: 1,
				nama: 'Test User',
				username: 'testuser',
				is_active: 1
			} as const satisfies Partial<Entity.IUser> as Entity.IUser;

			expect(() => {
				domain.validateUser(user);
			}).not.toThrow();
		});

		it('should throw InvalidParameterException for null user', () => {
			expect(() => {
				domain.validateUser(null);
			}).toThrow(InvalidParameterException);
		});

		it('should throw NotAuthorizationException for inactive user', () => {
			const inactiveUser = {
				id_user: 2,
				nama: 'Deactivated User',
				username: 'inactive',
				is_active: 0
			} as const satisfies Partial<Entity.IUser> as Entity.IUser;

			expect(() => {
				domain.validateUser(inactiveUser);
			}).toThrow(NotAuthorizationException);
		});
	});

	describe('validatePasswordMatch', () => {
		it('should not throw when valid is true', () => {
			expect(() => domain.validatePasswordMatch(true)).not.toThrow();
		});

		it('should throw InvalidParameterException when valid is false', () => {
			expect(() => domain.validatePasswordMatch(false)).toThrow(InvalidParameterException);
		});
	});

	describe('validateOldPasswordMatch', () => {
		it('should not throw when valid is true', () => {
			expect(() => domain.validateOldPasswordMatch(true)).not.toThrow();
		});

		it('should throw InvalidParameterException when valid is false', () => {
			expect(() => domain.validateOldPasswordMatch(false)).toThrow(InvalidParameterException);
		});
	});
});
