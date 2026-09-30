import { changePasswordUseCase } from '../../use-case/change-password.use-case';
import * as queries from '../../queries/auth.queries';
import { hashPassword } from '@/libs/helpers/password';
import { InvalidParameterException, NotAuthorizationException } from '@knittotextile/knitto-core-backend/dist/CoreException';

jest.mock('../../queries/auth.queries');

describe('changePasswordUseCase', () => {
	const mockedQueries = queries as jest.Mocked<typeof queries>;

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('should throw NotAuthorizationException if userId is missing', async () => {
		await expect(
			changePasswordUseCase({
				userId: undefined,
				oldPassword: 'old',
				newPassword: 'newPassword123'
			})
		).rejects.toThrow(NotAuthorizationException);
	});

	it('should throw InvalidParameterException if new password is too short', async () => {
		await expect(
			changePasswordUseCase({
				userId: 1,
				oldPassword: 'old',
				newPassword: '123'
			})
		).rejects.toThrow(InvalidParameterException);
	});

	it('should successfully update password when old password matches', async () => {
		const currentHashed = await hashPassword('currentPass123');
		mockedQueries.getUserById.mockResolvedValue({
			id_user: 1,
			username: 'user1',
			nama: 'User 1',
			password: currentHashed,
			is_active: 1
		});
		mockedQueries.updateUserPassword.mockResolvedValue();

		const result = await changePasswordUseCase({
			userId: 1,
			oldPassword: 'currentPass123',
			newPassword: 'newSecretPass456'
		});

		expect(result.success).toBe(true);
		expect(mockedQueries.updateUserPassword).toHaveBeenCalledWith(
			1,
			expect.stringMatching(/^\$2[ab]\$/)
		);
	});

	it('should throw InvalidParameterException when old password is wrong', async () => {
		const currentHashed = await hashPassword('currentPass123');
		mockedQueries.getUserById.mockResolvedValue({
			id_user: 1,
			username: 'user1',
			nama: 'User 1',
			password: currentHashed,
			is_active: 1
		});

		await expect(
			changePasswordUseCase({
				userId: 1,
				oldPassword: 'wrongPassword',
				newPassword: 'newSecretPass456'
			})
		).rejects.toThrow(InvalidParameterException);
	});
});
