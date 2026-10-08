/**
 * Generate ulang `recording_sessions.video_url` (presigned GET MinIO) memakai MINIO_ENDPOINT saat ini.
 *
 * Dipakai setelah MINIO_ENDPOINT berganti (mis. 127.0.0.1 → IP LAN) atau saat URL lama kedaluwarsa:
 * host & tanda tangan presigned URL terkunci saat dibuat, jadi tidak bisa sekadar diganti teksnya.
 *
 *   pnpm db:regenerate-video-urls            # dry-run: hanya menampilkan rencana
 *   pnpm db:regenerate-video-urls --apply    # tulis ke database
 */
import postgresConnection from '../src/libs/config/postgresConnection';
import { minioConfig } from '../src/libs/config';
import { createPresignedGetUrl, statArtifactObject } from '../src/libs/config/minioClient';
import { videoObjectKeyFromUrl } from '../src/app/http/session/use-case/session-video.use-case';

/** Sama dengan masa berlaku saat video diunggah (session-video.use-case). */
const VIDEO_URL_EXPIRY_SECONDS = 7 * 24 * 3600;

type Outcome = 'updated' | 'would-update' | 'skip-unknown-key' | 'skip-missing-object';

async function regenerateVideoUrls(apply: boolean): Promise<void> {
	if (!minioConfig.ENDPOINT) throw new Error('MINIO_ENDPOINT belum diisi.');
	console.info(`${apply ? 'APPLY' : 'DRY-RUN'} — endpoint MinIO: ${minioConfig.ENDPOINT}:${minioConfig.PORT}, bucket: ${minioConfig.BUCKET}`);

	const rows = await postgresConnection.raw<Array<{ id_session: string; video_url: string }>>(
		"SELECT id_session, video_url FROM recording_sessions WHERE video_url IS NOT NULL AND video_url <> '' ORDER BY id_session ASC"
	);

	const report: Array<{ id_session: number; object_key: string; outcome: Outcome }> = [];
	for (const row of rows) {
		const idSession = Number(row.id_session);
		const objectKey = videoObjectKeyFromUrl(row.video_url);
		if (!objectKey) {
			report.push({ id_session: idSession, object_key: '-', outcome: 'skip-unknown-key' });
			continue;
		}
		try {
			await statArtifactObject(objectKey);
		} catch {
			report.push({ id_session: idSession, object_key: objectKey, outcome: 'skip-missing-object' });
			continue;
		}
		if (apply) {
			const url = await createPresignedGetUrl(objectKey, VIDEO_URL_EXPIRY_SECONDS);
			await postgresConnection.raw('UPDATE recording_sessions SET video_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id_session = $2', [
				url,
				idSession
			]);
		}
		report.push({ id_session: idSession, object_key: objectKey, outcome: apply ? 'updated' : 'would-update' });
	}

	console.table(report);
	const count = (outcome: Outcome) => report.filter((r) => r.outcome === outcome).length;
	console.info(
		`Total ${report.length} sesi: ${apply ? `${count('updated')} di-update` : `${count('would-update')} akan di-update (jalankan dengan --apply)`}, ` +
			`${count('skip-missing-object')} objek tidak ada di MinIO, ${count('skip-unknown-key')} URL tidak dikenali.`
	);
}

regenerateVideoUrls(process.argv.includes('--apply'))
	.catch((err) => {
		console.error('Regenerate video_url gagal:', err instanceof Error ? err.message : err);
		process.exitCode = 1;
	})
	.finally(() => process.exit());
