import { loginUseCase } from '../../use-case/login.use-case';
import * as queries from '../../queries/auth.queries';
import { hashPassword } from '@/libs/helpers/password';
import crypto from 'crypto';
import { InvalidParameterException, NotAuthorizationException } from '@knittotextile/knitto-core-backend/dist/CoreException';

jest.mock('../../queries/auth.queries');

describe('loginUseCase', () => {
	const mockedQueries = queries as jest.Mocked<typeof queries>;

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('should login successfully with bcrypt password', async () => {
		const hashedPassword = await hashPassword('correctPassword');
		mockedQueries.getUserByUsername.mockResolvedValue({
			id_user: 10,
			username: 'johndoe',
			nama: 'John Doe',
			level: 'QA',
			password: hashedPassword,
			is_active: 1
		});

		const result = await loginUseCase({
			req: {} as any,
			username: 'johndoe',
			password: 'correctPassword'
		});

		expect(result.token).toBeDefined();
		expect(result.user.username).toBe('johndoe');
		expect(result.user.level).toBe('QA');
		expect(mockedQueries.updateUserPassword).not.toHaveBeenCalled();
	});

	it('should login successfully with legacy MD5 and auto-upgrade to Bcrypt', async () => {
		const legacyPassword = 'legacyPassword123';
		const md5Hash = crypto.createHash('md5').update(legacyPassword).digest('hex');

		mockedQueries.getUserByUsername.mockResolvedValue({
			id_user: 11,
			username: 'legacyuser',
			nama: 'Legacy User',
			level: 'ADMIN',
			password: md5Hash,
			is_active: 1
		});
		mockedQueries.updateUserPassword.mockResolvedValue();

		const result = await loginUseCase({
			req: {} as any,
			username: 'legacyuser',
			password: legacyPassword
		});

		expect(result.token).toBeDefined();
		expect(result.user.username).toBe('legacyuser');
		expect(mockedQueries.updateUserPassword).toHaveBeenCalledWith(
			11,
			expect.stringMatching(/^\$2[ab]\$/)
		);
	});

	it('should throw InvalidParameterException when user is not found', async () => {
		mockedQueries.getUserByUsername.mockResolvedValue(null);

		await expect(
			loginUseCase({
				req: {} as any,
				username: 'notfound',
				password: 'any'
			})
		).rejects.toThrow(InvalidParameterException);
	});

	it('should throw NotAuthorizationException when user is inactive', async () => {
		mockedQueries.getUserByUsername.mockResolvedValue({
			id_user: 12,
			username: 'disableduser',
			nama: 'Disabled User',
			level: 'QA',
			password: 'hash',
			is_active: 0
		});

		await expect(
			loginUseCase({
				req: {} as any,
				username: 'disableduser',
				password: 'any'
			})
		).rejects.toThrow(NotAuthorizationException);
	});

	it('should throw InvalidParameterException when password does not match', async () => {
		const hashedPassword = await hashPassword('correctPassword');
		mockedQueries.getUserByUsername.mockResolvedValue({
			id_user: 10,
			username: 'johndoe',
			nama: 'John Doe',
			level: 'QA',
			password: hashedPassword,
			is_active: 1
		});

		await expect(
			loginUseCase({
				req: {} as any,
				username: 'johndoe',
				password: 'wrongPassword'
			})
		).rejects.toThrow(InvalidParameterException);
	});
});
