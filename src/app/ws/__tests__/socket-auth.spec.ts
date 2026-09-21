import jwt from 'jsonwebtoken';
import { decodeSocketToken, extractSocketToken } from '../socket-auth';

const TEST_SECRET = 'test-secret-key';

describe('socket-auth', () => {
	describe('extractSocketToken', () => {
		it('mengambil token dari handshake.auth.token', () => {
			expect(extractSocketToken({ auth: { token: '  abc.def.ghi  ' } })).toBe('abc.def.ghi');
		});

		it('mengambil token dari header Authorization Bearer', () => {
			expect(extractSocketToken({ headers: { authorization: 'Bearer xyz.123' } })).toBe('xyz.123');
		});

		it('mengembalikan null bila tidak ada token', () => {
			expect(extractSocketToken({})).toBeNull();
			expect(extractSocketToken({ headers: { authorization: 'Basic abc' } })).toBeNull();
			expect(extractSocketToken({ auth: { token: '   ' } })).toBeNull();
		});
	});

	describe('decodeSocketToken', () => {
		it('mengembalikan id_user dari token valid', () => {
			const token = jwt.sign({ id_user: 42 }, TEST_SECRET, { expiresIn: '1h' });
			expect(decodeSocketToken(token, TEST_SECRET)).toEqual({ id_user: 42 });
		});

		it('melempar untuk token dengan secret berbeda', () => {
			const token = jwt.sign({ id_user: 42 }, 'secret-lain', { expiresIn: '1h' });
			expect(() => decodeSocketToken(token, TEST_SECRET)).toThrow();
		});

		it('melempar bila token tidak memuat id_user', () => {
			const token = jwt.sign({ username: 'budi' }, TEST_SECRET, { expiresIn: '1h' });
			expect(() => decodeSocketToken(token, TEST_SECRET)).toThrow();
		});
	});
});
