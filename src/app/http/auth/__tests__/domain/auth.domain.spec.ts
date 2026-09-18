import * as domain from '../../domain/auth.domain';
import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';

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
				level: 'IMPLEMENTOR'
			} as const satisfies Partial<Entity.IUser> as Entity.IUser;

			const result = domain.transformUserResponse(user);

			expect(result).toEqual({
				id_user: 1,
				nama: 'Test User',
				username: 'testuser',
				input: 'enable'
			});
		});

		it('should set input to disable for non-IMPLEMENTOR', () => {
			const user = {
				id_user: 1,
				nama: 'Test User',
				username: 'testuser',
				level: 'USER'
			} as const satisfies Partial<Entity.IUser> as Entity.IUser;

			const result = domain.transformUserResponse(user);

			expect(result.input).toBe('disable');
		});
	});

	describe('validateUser', () => {
		it('should not throw for valid user', () => {
			const user = {
				id_user: 1,
				nama: 'Test User',
				username: 'testuser'
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
	});
});
