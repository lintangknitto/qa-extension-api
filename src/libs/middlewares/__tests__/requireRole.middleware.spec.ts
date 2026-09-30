import { requireRole } from '../requireRole.middleware';

describe('requireRole middleware', () => {
	let mockReq: any;
	let mockRes: any;
	let mockNext: jest.Mock;

	beforeEach(() => {
		mockReq = {
			userData: {
				id_user: 1,
				level: 'ADMIN'
			}
		};
		mockRes = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis()
		};
		mockNext = jest.fn();
	});

	it('should allow user if user level is in allowed roles', () => {
		const middleware = requireRole(['SUPERADMIN', 'ADMIN']);
		middleware(mockReq, mockRes, mockNext);

		expect(mockNext).toHaveBeenCalled();
		expect(mockRes.json).not.toHaveBeenCalled();
	});

	it('should block user with 403 if user level is not in allowed roles', () => {
		mockReq.userData.level = 'QA';
		const middleware = requireRole(['SUPERADMIN', 'ADMIN']);
		middleware(mockReq, mockRes, mockNext);

		expect(mockNext).not.toHaveBeenCalled();
		expect(mockRes.status).toHaveBeenCalledWith(403);
	});

	it('should block user with 403 if userData or level is missing', () => {
		mockReq.userData = undefined;
		const middleware = requireRole(['SUPERADMIN', 'ADMIN']);
		middleware(mockReq, mockRes, mockNext);

		expect(mockNext).not.toHaveBeenCalled();
		expect(mockRes.status).toHaveBeenCalledWith(403);
	});
});
