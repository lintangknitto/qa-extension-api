import postgresConnection from '../src/libs/config/postgresConnection';
import { hashPassword } from '../src/libs/helpers/password';
import { VALID_USER_LEVELS, type TUserLevel } from '../src/app/http/user/user.request';

interface SeedUserDef {
	username: string;
	nama: string;
	level: TUserLevel;
}

const DEFAULT_USERS: SeedUserDef[] = [
	{ username: 'superadmin', nama: 'Super Administrator', level: 'SUPERADMIN' },
	{ username: 'admin', nama: 'Administrator', level: 'ADMIN' },
	{ username: 'qa', nama: 'QA Tester', level: 'QA' },
	{ username: 'implementor', nama: 'Implementor', level: 'IMPLEMENTOR' },
	{ username: 'viewer', nama: 'Viewer User', level: 'VIEWER' }
];

async function seedAllRoles(): Promise<void> {
	const defaultPassword = process.env.DEFAULT_SEED_PASSWORD?.trim() || 'Admin123!';
	const hashedPassword = await hashPassword(defaultPassword);

	console.info(`Memulai seeding user untuk semua role (password default: "${defaultPassword}")...`);

	await postgresConnection.transaction(async (client) => {
		for (const def of DEFAULT_USERS) {
			const checkRes = await client.query<{ id_user: number; level: string }>(
				'SELECT id_user, level FROM users WHERE username = $1',
				[def.username]
			);

			if (checkRes.rows.length > 0) {
				// Update password, nama, dan pastikan level serta is_active benar
				await client.query(
					`UPDATE users
					 SET password = $1, nama = $2, level = $3, is_active = TRUE, updated_at = CURRENT_TIMESTAMP
					 WHERE username = $4`,
					[hashedPassword, def.nama, def.level, def.username]
				);
				console.info(`✓ User "${def.username}" (${def.level}) di-update.`);
			} else {
				// Insert user baru
				await client.query(
					`INSERT INTO users (username, password, nama, level, is_active)
					 VALUES ($1, $2, $3, $4, TRUE)`,
					[def.username, hashedPassword, def.nama, def.level]
				);
				console.info(`✓ User "${def.username}" (${def.level}) berhasil dibuat.`);
			}
		}
	});

	console.info('\nRingkasan User Berhasil di-seed:');
	console.table(
		DEFAULT_USERS.map((u) => ({
			Username: u.username,
			Nama: u.nama,
			Role: u.level,
			Password: defaultPassword
		}))
	);
}

seedAllRoles()
	.catch((err) => {
		console.error('Seeding user gagal:', err instanceof Error ? err.message : err);
		process.exitCode = 1;
	})
	.finally(async () => {
		process.exit(0);
	});
