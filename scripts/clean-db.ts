import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { MySqlConnector } from '@knittotextile/knitto-mysql';
import * as Minio from 'minio';

const mysql = new MySqlConnector({
	host: process.env.DB_HOST_MYSQL || '127.0.0.1',
	database: process.env.DB_NAME_MYSQL || 'qa_recorder',
	port: Number(process.env.DB_PORT_MYSQL || 3307),
	user: process.env.DB_USER_MYSQL || 'root',
	password: process.env.DB_PASS_MYSQL || 'qa_root_password',
	connectionLimit: 5,
	dateStrings: true
});

const minioClient = new Minio.Client({
	endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
	port: Number(process.env.MINIO_PORT || 9000),
	useSSL: process.env.MINIO_USE_SSL === 'true',
	accessKey: process.env.MINIO_ACCESS_KEY || 'qa_minio',
	secretKey: process.env.MINIO_SECRET_KEY || 'qa_minio_secret'
});

const bucketName = process.env.MINIO_BUCKET || 'qa-recording-artifacts';

async function main() {
	console.log('=== Memulai Proses Cleansing & Seeding Data QA Recorder ===');

	await mysql.init();

	// 1. List semua tabel di database
	const tables = await mysql.raw<{ [key: string]: string }[]>('SHOW TABLES');
	const tableNames = tables.map((t) => Object.values(t)[0]);
	console.log('Tabel terdeteksi:', tableNames);

	// Target tabel transaksional yang akan dibersihkan
	const targetTables = [
		'qa_recording_checkpoint',
		'qa_recording_checkpoints',
		'qa_recording_generation',
		'qa_recording_generations',
		'qa_recording_artifact',
		'qa_recording_artifacts',
		'qa_recording_event',
		'qa_recording_events',
		'qa_recording_session',
		'qa_recording_sessions',
		'qa_test_case',
		'qa_test_cases',
		'qa_user_project',
		'qa_user_projects',
		'qa_project',
		'qa_projects',
		'user'
	].filter((t) => tableNames.includes(t));

	console.log('Tabel yang akan dibersihkan & di-reset:', targetTables);

	await mysql.raw('SET FOREIGN_KEY_CHECKS = 0');
	for (const table of targetTables) {
		await mysql.raw(`TRUNCATE TABLE \`${table}\``);
		console.log(`✓ Tabel ${table} berhasil di-truncate.`);
	}
	await mysql.raw('SET FOREIGN_KEY_CHECKS = 1');

	// 2. Membersihkan object di MinIO bucket jika ada
	try {
		const exists = await minioClient.bucketExists(bucketName);
		if (exists) {
			console.log(`Memeriksa MinIO bucket "${bucketName}"...`);
			const stream = minioClient.listObjects(bucketName, '', true);
			const objectsList: string[] = [];
			await new Promise<void>((resolve, reject) => {
				stream.on('data', (obj) => {
					if (obj.name) objectsList.push(obj.name);
				});
				stream.on('error', (err) => reject(err));
				stream.on('end', () => resolve());
			});

			if (objectsList.length > 0) {
				console.log(`Menghapus ${objectsList.length} file artifact dari MinIO...`);
				await minioClient.removeObjects(bucketName, objectsList);
				console.log(`✓ ${objectsList.length} file di MinIO bucket berhasil dibersihkan.`);
			} else {
				console.log('MinIO bucket sudah kosong.');
			}
		}
	} catch (minioErr) {
		console.warn('Peringatan MinIO:', (minioErr as Error).message);
	}

	// 3. Seeding User Lengkap Berdasarkan Role
	console.log('\n--- Melakukan Seeding User & Hak Akses ---');
	await mysql.raw(`
		INSERT INTO \`user\` (\`id_user\`, \`nama\`, \`username\`, \`password\`, \`level\`, \`is_active\`, \`aktif\`)
		VALUES
			(1, 'Super Administrator', 'superadmin', md5('superadmin123'), 'SUPERADMIN', 1, 1),
			(2, 'QA Administrator', 'admin', md5('admin123'), 'ADMIN', 1, 1),
			(3, 'Senior QA Tester', 'qatester', md5('qatester123'), 'QA', 1, 1),
			(4, 'QA Lead Engineer', 'qaadmin', md5('qaadmin123'), 'QA', 1, 1),
			(5, 'Frontend Developer', 'developer', md5('developer123'), 'IMPLEMENTOR', 1, 1),
			(6, 'Backend Implementor', 'implementor', md5('implementor123'), 'IMPLEMENTOR', 1, 1),
			(7, 'Product Stakeholder', 'viewer', md5('viewer123'), 'VIEWER', 1, 1);
	`);
	console.log('✓ Berhasil melakukan seed 7 user (SUPERADMIN, ADMIN, QA, IMPLEMENTOR, VIEWER).');

	// 4. Seeding Sample Projects
	if (tableNames.includes('qa_project') || tableNames.includes('qa_projects')) {
		const projectTable = tableNames.includes('qa_project') ? 'qa_project' : 'qa_projects';
		await mysql.raw(`
			INSERT INTO \`${projectTable}\` (\`id_project\`, \`name\`, \`code\`, \`description\`, \`base_url\`, \`is_active\`, \`created_by_user_id\`)
			VALUES
				(1, 'Knitto Portal E-Commerce', 'KNITTO-PORTAL', 'Automasi pengujian web katalog kain, cart, dan checkout pemesanan online', 'https://knitto.co.id', 1, 1),
				(2, 'Knitto Internal ERP & POS', 'KNITTO-ERP', 'Automasi pengujian modul stock gudang, transaksi kasir POS, dan master user', 'http://localhost:3000', 1, 1);
		`);
		console.log('✓ Berhasil melakukan seed 2 master project (KNITTO-PORTAL, KNITTO-ERP).');
	}

	// 5. Seeding Relasi Project Scoping (qa_user_project)
	if (tableNames.includes('qa_user_project') || tableNames.includes('qa_user_projects')) {
		const userProjTable = tableNames.includes('qa_user_project') ? 'qa_user_project' : 'qa_user_projects';
		await mysql.raw(`
			INSERT INTO \`${userProjTable}\` (\`id_user\`, \`id_project\`, \`created_by\`)
			VALUES
				(3, 1, 1),
				(3, 2, 1),
				(5, 1, 1),
				(6, 2, 1),
				(7, 1, 1),
				(7, 2, 1);
		`);
		console.log('✓ Berhasil melakukan seed relasi user project scoping.');
	}

	console.log('\n=== Database Cleansing & Seeding Selesai dengan Sukses! ===');
	process.exit(0);
}

main().catch((err) => {
	console.error('Gagal cleansing & seeding database:', err);
	process.exit(1);
});
