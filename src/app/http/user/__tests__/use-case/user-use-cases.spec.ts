import { listUsersUseCase } from '../../use-case/list-users.use-case';
import { createUserUseCase } from '../../use-case/create-user.use-case';
import { getUserDetailUseCase } from '../../use-case/get-user-detail.use-case';
import { updateUserUseCase } from '../../use-case/update-user.use-case';
import { resetPasswordUseCase } from '../../use-case/reset-password.use-case';
import { deleteUserUseCase } from '../../use-case/delete-user.use-case';
import * as queries from '../../queries/user.queries';
import * as repo from '../../repo/user.repo';
import {
	InvalidParameterException,
	NotAuthorizationException,
	NotFoundException
} from '@knittotextile/knitto-core-backend/dist/CoreException';

jest.mock('../../queries/user.queries');
jest.mock('../../repo/user.repo');

describe('User Management Use Cases', () => {
	const mockedQueries = queries as jest.Mocked<typeof queries>;
	const mockedRepo = repo as jest.Mocked<typeof repo>;

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('listUsersUseCase', () => {
		it('should return paginated list of users', async () => {
			mockedQueries.listUsers.mockResolvedValue([
				{ id_user: 1, nama: 'User A', username: 'usera', level: 'QA', is_active: 1 },
				{ id_user: 2, nama: 'User B', username: 'userb', level: 'ADMIN', is_active: 0 }
			]);
			mockedQueries.countUsers.mockResolvedValue(2);

			const result = await listUsersUseCase({ page: 0, perPage: 20 });
			expect(result.list.length).toBe(2);
			expect(result.total).toBe(2);
			expect(result.list[0].nama).toBe('User A');
			expect(result.list[1].is_active).toBe(false);
		});
	});

	describe('createUserUseCase', () => {
		it('should create user and assign projects', async () => {
			mockedQueries.findUserByUsername.mockResolvedValue(null);
			mockedRepo.insertUser.mockResolvedValue(15);
			mockedRepo.setUserAssignedProjects.mockResolvedValue();
			mockedQueries.findUserById.mockResolvedValue({
				id_user: 15,
				nama: 'New QA',
				username: 'newqa',
				level: 'QA',
				is_active: 1
			});

			const result = await createUserUseCase({
				actorLevel: 'SUPERADMIN',
				actorUserId: 1,
				body: {
					nama: 'New QA',
					username: 'newqa',
					password: 'password123',
					level: 'QA',
					project_ids: [1, 2]
				}
			});

			expect(result.id_user).toBe(15);
			expect(result.assigned_project_ids).toEqual([1, 2]);
			expect(mockedRepo.setUserAssignedProjects).toHaveBeenCalledWith(15, [1, 2], 1);
		});

		it('should reject non-admin actors', async () => {
			await expect(
				createUserUseCase({
					actorLevel: 'QA',
					body: {
						nama: 'Some User',
						username: 'someuser',
						password: 'password123',
						level: 'QA'
					}
				})
			).rejects.toThrow(NotAuthorizationException);
		});

		it('should reject duplicate username', async () => {
			mockedQueries.findUserByUsername.mockResolvedValue({ id_user: 9, username: 'duplicate' });

			await expect(
				createUserUseCase({
					actorLevel: 'ADMIN',
					body: {
						nama: 'Duplicate User',
						username: 'duplicate',
						password: 'password123',
						level: 'QA'
					}
				})
			).rejects.toThrow(InvalidParameterException);
		});
	});

	describe('getUserDetailUseCase', () => {
		it('should return user detail with assigned project IDs', async () => {
			mockedQueries.findUserById.mockResolvedValue({
				id_user: 3,
				nama: 'Detail User',
				username: 'detailuser',
				level: 'IMPLEMENTOR',
				is_active: 1
			});
			mockedQueries.getUserAssignedProjectIds.mockResolvedValue([5, 8]);

			const result = await getUserDetailUseCase(3);
			expect(result.id_user).toBe(3);
			expect(result.assigned_project_ids).toEqual([5, 8]);
		});

		it('should throw NotFoundException if user not found', async () => {
			mockedQueries.findUserById.mockResolvedValue(null);
			await expect(getUserDetailUseCase(999)).rejects.toThrow(NotFoundException);
		});
	});

	describe('updateUserUseCase', () => {
		it('should update user and sync project assignments', async () => {
			mockedQueries.findUserById.mockResolvedValue({
				id_user: 4,
				nama: 'Old Name',
				username: 'user4',
				level: 'QA',
				is_active: 1
			});
			mockedRepo.updateUser.mockResolvedValue();
			mockedRepo.setUserAssignedProjects.mockResolvedValue();
			mockedQueries.getUserAssignedProjectIds.mockResolvedValue([10]);

			const result = await updateUserUseCase({
				actorLevel: 'ADMIN',
				actorUserId: 1,
				idUser: 4,
				body: {
					nama: 'New Name',
					level: 'IMPLEMENTOR',
					project_ids: [10]
				}
			});

			expect(mockedRepo.updateUser).toHaveBeenCalledWith(4, {
				nama: 'New Name',
				level: 'IMPLEMENTOR',
				is_active: undefined
			});
			expect(mockedRepo.setUserAssignedProjects).toHaveBeenCalledWith(4, [10], 1);
			expect(result.assigned_project_ids).toEqual([10]);
		});
	});

	describe('resetPasswordUseCase', () => {
		it('should reset user password', async () => {
			mockedQueries.findUserById.mockResolvedValue({
				id_user: 6,
				nama: 'Target User',
				username: 'target',
				level: 'QA',
				is_active: 1
			});
			mockedRepo.updateUserPassword.mockResolvedValue();

			const result = await resetPasswordUseCase({
				actorLevel: 'ADMIN',
				idUser: 6,
				password: 'newResetPassword123'
			});

			expect(result.success).toBe(true);
			expect(mockedRepo.updateUserPassword).toHaveBeenCalledWith(
				6,
				expect.stringMatching(/^\$2[ab]\$/)
			);
		});
	});

	describe('deleteUserUseCase', () => {
		it('should prevent deleting own account', async () => {
			await expect(
				deleteUserUseCase({
					actorLevel: 'SUPERADMIN',
					actorUserId: 2,
					idUser: 2
				})
			).rejects.toThrow(InvalidParameterException);
		});

		it('should soft-deactivate user if user has associated recordings or test cases', async () => {
			mockedQueries.findUserById.mockResolvedValue({
				id_user: 8,
				username: 'user8',
				level: 'QA'
			});
			mockedQueries.countUserAssociatedData.mockResolvedValue(5);
			mockedRepo.softDeactivateUser.mockResolvedValue();

			const result = await deleteUserUseCase({
				actorLevel: 'ADMIN',
				actorUserId: 1,
				idUser: 8
			});

			expect(result.mode).toBe('deactivated');
			expect(mockedRepo.softDeactivateUser).toHaveBeenCalledWith(8);
			expect(mockedRepo.deleteUser).not.toHaveBeenCalled();
		});

		it('should hard delete user if user has no associated data', async () => {
			mockedQueries.findUserById.mockResolvedValue({
				id_user: 9,
				username: 'sterileuser',
				level: 'VIEWER'
			});
			mockedQueries.countUserAssociatedData.mockResolvedValue(0);
			mockedRepo.deleteUser.mockResolvedValue();

			const result = await deleteUserUseCase({
				actorLevel: 'ADMIN',
				actorUserId: 1,
				idUser: 9
			});

			expect(result.mode).toBe('deleted');
			expect(mockedRepo.deleteUser).toHaveBeenCalledWith(9);
		});
	});
});
