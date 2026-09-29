"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const dotenv_1 = tslib_1.__importDefault(require("dotenv"));
const path_1 = tslib_1.__importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env') });
const knitto_mysql_1 = require("@knittotextile/knitto-mysql");
const Minio = tslib_1.__importStar(require("minio"));
const mysql = new knitto_mysql_1.MySqlConnector({
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
    console.log('=== Memulai Proses Cleansing Data QA Recorder ===');
    await mysql.init();
    // 1. List semua tabel di database
    const tables = await mysql.raw('SHOW TABLES');
    const tableNames = tables.map((t) => Object.values(t)[0]);
    console.log('Tabel terdeteksi:', tableNames);
    // Target tabel yang akan dibersihkan (mengecualikan tabel user / auth)
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
        'qa_project',
        'qa_projects'
    ].filter((t) => tableNames.includes(t));
    console.log('Tabel yang akan dibersihkan:', targetTables);
    await mysql.raw('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of targetTables) {
        const countBefore = await mysql.raw(`SELECT COUNT(*) AS total FROM \`${table}\``);
        const total = Number(countBefore[0]?.total ?? 0);
        await mysql.raw(`TRUNCATE TABLE \`${table}\``);
        console.log(`✓ Tabel ${table} berhasil dibersihkan (${total} baris dihapus).`);
    }
    await mysql.raw('SET FOREIGN_KEY_CHECKS = 1');
    // 2. Membersihkan object di MinIO bucket jika ada
    try {
        const exists = await minioClient.bucketExists(bucketName);
        if (exists) {
            console.log(`Memeriksa MinIO bucket "${bucketName}"...`);
            const stream = minioClient.listObjects(bucketName, '', true);
            const objectsList = [];
            await new Promise((resolve, reject) => {
                stream.on('data', (obj) => {
                    if (obj.name)
                        objectsList.push(obj.name);
                });
                stream.on('error', (err) => reject(err));
                stream.on('end', () => resolve());
            });
            if (objectsList.length > 0) {
                console.log(`Menghapus ${objectsList.length} file artifact dari MinIO...`);
                await minioClient.removeObjects(bucketName, objectsList);
                console.log(`✓ ${objectsList.length} file di MinIO bucket berhasil dibersihkan.`);
            }
            else {
                console.log('MinIO bucket sudah kosong.');
            }
        }
    }
    catch (minioErr) {
        console.warn('Peringatan MinIO:', minioErr.message);
    }
    console.log('=== Cleansing Selesai dengan Sukses! ===');
    process.exit(0);
}
main().catch((err) => {
    console.error('Gagal cleansing database:', err);
    process.exit(1);
});
