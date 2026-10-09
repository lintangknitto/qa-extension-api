import * as Minio from 'minio';
import postgresConnection from '../src/libs/config/postgresConnection';
import { minioConfig } from '../src/libs/config';

const minioClient = new Minio.Client({
	endPoint: minioConfig.ENDPOINT,
	port: minioConfig.PORT,
	useSSL: minioConfig.USE_SSL,
	accessKey: minioConfig.ACCESS_KEY,
	secretKey: minioConfig.SECRET_KEY
});

async function main(): Promise<void> {
	try {
		console.info('=== Sesi recording terbaru ===');
		const sessions = await postgresConnection.raw<Array<Record<string, unknown>>>(
			'SELECT * FROM recording_sessions ORDER BY id_session DESC LIMIT $1',
			[10]
		);

		if (sessions.length === 0) console.info('Belum ada sesi rekaman.');
		for (const session of sessions) {
			const idSession = Number(session.id_session);
			console.info(`\n[Session #${idSession}]`);
			console.info(`  Test Case : ${session.test_case_no ?? '-'}`);
			console.info(`  Title     : ${session.title ?? '-'}`);
			console.info(`  Status    : ${session.status ?? '-'}`);
			console.info(`  Video key : ${session.video_object_key ?? '(kosong)'}`);

			const [artifacts, generations] = await Promise.all([
				postgresConnection.raw<Array<Record<string, unknown>>>(
					'SELECT kind, object_key, content_type, size_bytes, status FROM recording_artifacts WHERE id_session = $1 ORDER BY id_artifact',
					[idSession]
				),
				postgresConnection.raw<Array<Record<string, unknown>>>(
					'SELECT id_generation, kind, status, error_message, LENGTH(output) AS output_length, created_at FROM recording_generations WHERE id_session = $1 ORDER BY id_generation',
					[idSession]
				)
			]);
			console.info(`  Artifacts : ${JSON.stringify(artifacts)}`);
			console.info(`  Generations: ${JSON.stringify(generations)}`);
		}

		if (minioConfig.ENDPOINT && minioConfig.ACCESS_KEY && minioConfig.SECRET_KEY) {
			console.info(`\n=== Objects in MinIO bucket ${minioConfig.BUCKET} ===`);
			const stream = minioClient.listObjectsV2(minioConfig.BUCKET, '', true);
			await new Promise<void>((resolve, reject) => {
				stream.on('data', (object) => console.info(`- ${object.name} (${object.size} bytes)`));
				stream.once('error', reject);
				stream.once('end', resolve);
			});
		}
	} finally {
		await postgresConnection.end();
	}
}

main().catch((error: unknown) => {
	console.error('Gagal memeriksa recording:', error instanceof Error ? error.message : 'Unknown error');
	process.exitCode = 1;
});
