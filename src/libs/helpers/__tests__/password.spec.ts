import { hashPassword, verifyPassword } from '../password';
import crypto from 'crypto';

describe('password helper', () => {
	it('should hash password with bcrypt format ($2a$ or $2b$)', async () => {
		const rawPassword = 'secretPassword123';
		const hash = await hashPassword(rawPassword);

		expect(hash).toBeDefined();
		expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);

		const { valid, needsUpgrade } = await verifyPassword(rawPassword, hash);
		expect(valid).toBe(true);
		expect(needsUpgrade).toBe(false);
	});

	it('should verify legacy MD5 hash and flag needsUpgrade', async () => {
		const rawPassword = 'legacyPassword456';
		const md5Hash = crypto.createHash('md5').update(rawPassword).digest('hex');

		const { valid, needsUpgrade } = await verifyPassword(rawPassword, md5Hash);
		expect(valid).toBe(true);
		expect(needsUpgrade).toBe(true);
	});

	it('should reject wrong password against Bcrypt and MD5', async () => {
		const rawPassword = 'correctPassword';
		const hash = await hashPassword(rawPassword);
		const md5Hash = crypto.createHash('md5').update(rawPassword).digest('hex');

		const resBcrypt = await verifyPassword('wrongPassword', hash);
		expect(resBcrypt.valid).toBe(false);

		const resMd5 = await verifyPassword('wrongPassword', md5Hash);
		expect(resMd5.valid).toBe(false);
	});

	it('should return false for empty or null inputs safely', async () => {
		expect(await verifyPassword('', 'somehash')).toEqual({ valid: false, needsUpgrade: false });
		expect(await verifyPassword('pass', null)).toEqual({ valid: false, needsUpgrade: false });
		expect(await verifyPassword('pass', undefined)).toEqual({ valid: false, needsUpgrade: false });
	});
});
