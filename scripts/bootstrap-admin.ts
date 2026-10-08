import postgresConnection from '../src/libs/config/postgresConnection';
import { hashPassword } from '../src/libs/helpers/password';

const required = (name: string): string => {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`${name} wajib diatur untuk bootstrap administrator.`);
	return value;
};

async function bootstrapAdmin(): Promise<void> {
	if (process.env.ALLOW_ADMIN_BOOTSTRAP !== 'true') {
		throw new Error('Set ALLOW_ADMIN_BOOTSTRAP=true hanya untuk menjalankan bootstrap secara sengaja.');
	}

	const username = required('BOOTSTRAP_ADMIN_USERNAME');
	const name = required('BOOTSTRAP_ADMIN_NAME');
	const password = required('BOOTSTRAP_ADMIN_PASSWORD');
	if (username.length < 3 || username.length > 100) throw new Error('Username harus 3–100 karakter.');
	if (name.length < 1 || name.length > 150) throw new Error('Nama harus 1–150 karakter.');
	if (password.length < 16) throw new Error('Password bootstrap minimal 16 karakter.');

	const passwordHash = await hashPassword(password);
	await postgresConnection.transaction(async (client) => {
		await client.query('SELECT pg_advisory_xact_lock($1)', [84201946]);
		const { rows } = await client.query<{ total: string }>('SELECT COUNT(*) AS total FROM users');
		if (Number(rows[0]?.total ?? 0) !== 0) {
			throw new Error('Bootstrap ditolak: tabel users sudah berisi akun.');
		}

		await client.query(
			`INSERT INTO users (username, password, nama, level, is_active)
			 VALUES ($1, $2, $3, 'SUPERADMIN', TRUE)`,
			[username, passwordHash, name]
		);
	});

	console.info('Bootstrap administrator berhasil. Simpan kredensial dengan aman dan hapus variabel bootstrap.');
}

bootstrapAdmin()
	.catch((error: unknown) => {
		console.error('Bootstrap administrator gagal:', error instanceof Error ? error.message : 'Unknown error');
		process.exitCode = 1;
	})
	.finally(async () => {
		await postgresConnection.end();
	});
