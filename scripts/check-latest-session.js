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
}, console);
const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'qa_minio',
    secretKey: process.env.MINIO_SECRET_KEY || 'qa_minio_secret'
});
const bucketName = process.env.MINIO_BUCKET || 'qa-recording-artifacts';
async function main() {
    console.log('=== Memeriksa Sesi Terakhir & Status Video ===');
    try {
        await mysql.init();
        // Cek tabel sessions
        const tables = await mysql.raw('SHOW TABLES');
        const tableNames = tables.map((t) => Object.values(t)[0]);
        const sessionTable = tableNames.find((t) => t === 'qa_recording_session' || t === 'qa_recording_sessions') || 'qa_recording_session';
        const artifactTable = tableNames.find((t) => t === 'qa_recording_artifact' || t === 'qa_recording_artifacts') || 'qa_recording_artifact';
        console.log(`\n--- Daftar Sesi Terbaru dari tabel ${sessionTable} ---`);
        const sessions = await mysql.raw(`SELECT * FROM \`${sessionTable}\` ORDER BY id_session DESC LIMIT 10`);
        if (sessions.length === 0) {
            console.log('Belum ada sesi rekaman di database.');
        }
        else {
            for (const s of sessions) {
                console.log(`\n[Session #${s.id_session}]`);
                console.log(`  Test Case No : ${s.test_case_no || s.test_case_id || '-'}`);
                console.log(`  Title        : ${s.title}`);
                console.log(`  Status       : ${s.status}`);
                console.log(`  Result       : ${s.result}`);
                console.log(`  Actual Result: ${s.actual_result}`);
                console.log(`  Video URL    : ${s.video_url || '(NULL / Kosong)'}`);
                console.log(`  Record Video : ${s.record_video}`);
                console.log(`  Target URL   : ${s.target_url}`);
                console.log(`  Created At   : ${s.created_at}`);
                console.log(`  Updated At   : ${s.updated_at}`);
                // Cek artifacts terkait sesi ini
                const artifacts = await mysql.raw(`SELECT * FROM \`${artifactTable}\` WHERE id_session = ?`, [s.id_session]);
                console.log(`  Artifacts (${artifacts.length}):`, artifacts.map((a) => `${a.kind} (${a.file_name || a.object_key})`));
                // Cek generations terkait sesi ini
                const gens = await mysql.raw(`SELECT id_generation, kind, status, error_message, LENGTH(output) as out_len, created_at FROM qa_recording_generation WHERE id_session = ?`, [s.id_session]);
                console.log(`  Generations (${gens.length}):`, gens);
            }
        }
        // Cek MinIO Object Storage
        console.log(`\n--- Daftar Objek di MinIO Bucket: "${bucketName}" ---`);
        const stream = minioClient.listObjectsV2(bucketName, '', true);
        let objCount = 0;
        await new Promise((resolve) => {
            stream.on('data', (obj) => {
                objCount++;
                console.log(`  - [MinIO] Key: ${obj.name} | Size: ${obj.size} bytes | LastModified: ${obj.lastModified}`);
            });
            stream.on('error', (err) => {
                console.error('Error saat list MinIO objects:', err.message);
                resolve();
            });
            stream.on('end', () => {
                console.log(`Total objek di MinIO: ${objCount}`);
                resolve();
            });
        });
    }
    catch (err) {
        console.error('Terjadi error saat inspeksi:', err);
    }
    finally {
        process.exit(0);
    }
}
main();
