import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * Membuat hash password baru menggunakan bcrypt dengan cost factor 10.
 */
export const hashPassword = async (password: string): Promise<string> => {
	const salt = await bcrypt.genSalt(10);
	return bcrypt.hash(password, salt);
};

/**
 * Memverifikasi password plain text terhadap hash yang tersimpan di database.
 * Mendukung format Bcrypt modern dan fallback ke format legacy MD5 / plaintext,
 * serta menandai `needsUpgrade: true` jika hash perlu diperbarui otomatis ke Bcrypt.
 */
export const verifyPassword = async (
	plainText: string,
	storedHash: string | undefined | null
): Promise<{ valid: boolean; needsUpgrade: boolean }> => {
	if (!plainText || !storedHash) {
		return { valid: false, needsUpgrade: false };
	}

	// 1. Cek format Bcrypt ($2a$, $2b$, $2y$)
	if (
		storedHash.startsWith('$2a$') ||
		storedHash.startsWith('$2b$') ||
		storedHash.startsWith('$2y$')
	) {
		try {
			const isMatch = await bcrypt.compare(plainText, storedHash);
			return { valid: isMatch, needsUpgrade: false };
		} catch {
			return { valid: false, needsUpgrade: false };
		}
	}

	// 2. Fallback cek MD5 legacy (32 hex characters)
	const md5Hash = crypto.createHash('md5').update(plainText).digest('hex');
	if (md5Hash.toLowerCase() === storedHash.toLowerCase()) {
		return { valid: true, needsUpgrade: true };
	}

	// 3. Fallback jika plain text
	if (plainText === storedHash) {
		return { valid: true, needsUpgrade: true };
	}

	return { valid: false, needsUpgrade: false };
};
