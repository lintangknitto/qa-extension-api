import mysqlConnection from './mysqlConnection';

/**
 * Memastikan tabel pendukung seperti `qa_user_project` tersedia
 * serta kolom pendukung pada tabel `user` terindeks dengan baik.
 */
export const ensureDatabaseSchema = async (): Promise<void> => {
	try {
		await mysqlConnection.raw(`
			CREATE TABLE IF NOT EXISTS \`qa_user_project\` (
				\`id_user\` INT NOT NULL,
				\`id_project\` INT NOT NULL,
				\`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				\`created_by\` INT DEFAULT NULL,
				PRIMARY KEY (\`id_user\`, \`id_project\`),
				KEY \`idx_qa_user_project_project\` (\`id_project\`),
				KEY \`idx_qa_user_project_user\` (\`id_user\`)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
		`);

		// Pastikan kolom pendukung pada tabel user tersedia
		try {
			await mysqlConnection.raw(`ALTER TABLE \`user\` ADD COLUMN IF NOT EXISTS \`is_active\` TINYINT(1) NOT NULL DEFAULT 1 AFTER \`level\``);
		} catch {
			// Kolom mungkin sudah ada atau IF NOT EXISTS tidak disupport versi tertentu
		}
		try {
			await mysqlConnection.raw(`ALTER TABLE \`user\` ADD COLUMN IF NOT EXISTS \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`);
		} catch {
			// Kolom mungkin sudah ada
		}
		try {
			await mysqlConnection.raw(`ALTER TABLE \`user\` ADD COLUMN IF NOT EXISTS \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
		} catch {
			// Kolom mungkin sudah ada
		}
	} catch (err) {
		// Log warning jika terjadi issue DDL, tanpa memblokir inisialisasi aplikasi
		console.warn('[Schema Init] Peringatan inisialisasi skema qa_user_project:', (err as Error).message);
	}
};
