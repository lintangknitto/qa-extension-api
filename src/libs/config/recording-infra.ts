import { openAiConfig, minioConfig } from '.';

export interface RecordingInfraSettings {
	openAi: {
		API_KEY: string;
		BASE_URL: string;
		MODEL: string;
	};
	minio: {
		ENDPOINT: string;
		ACCESS_KEY: string;
		SECRET_KEY: string;
		BUCKET: string;
	};
}

export const currentRecordingInfraSettings = (): RecordingInfraSettings => ({
	openAi: {
		API_KEY: openAiConfig.API_KEY,
		BASE_URL: openAiConfig.BASE_URL,
		MODEL: openAiConfig.MODEL
	},
	minio: {
		ENDPOINT: minioConfig.ENDPOINT,
		ACCESS_KEY: minioConfig.ACCESS_KEY,
		SECRET_KEY: minioConfig.SECRET_KEY,
		BUCKET: minioConfig.BUCKET
	}
});

/**
 * Mengembalikan daftar NAMA konfigurasi yang belum terisi — tidak pernah
 * mengembalikan nilai secret, supaya aman dicatat di log.
 */
export const collectRecordingInfraProblems = (settings: RecordingInfraSettings): string[] => {
	const problems: string[] = [];

	if (!settings.openAi.API_KEY.trim()) problems.push('OPENAI_API_KEY');
	if (!settings.openAi.BASE_URL.trim()) problems.push('OPENAI_BASE_URL');
	if (!settings.openAi.MODEL.trim()) problems.push('OPENAI_MODEL');

	if (!settings.minio.ENDPOINT.trim()) problems.push('MINIO_ENDPOINT');
	if (!settings.minio.ACCESS_KEY.trim()) problems.push('MINIO_ACCESS_KEY');
	if (!settings.minio.SECRET_KEY.trim()) problems.push('MINIO_SECRET_KEY');
	if (!settings.minio.BUCKET.trim()) problems.push('MINIO_BUCKET');

	return problems;
};

export const assertRecordingInfraConfigured = (settings: RecordingInfraSettings): void => {
	const problems = collectRecordingInfraProblems(settings);
	if (problems.length > 0)
		throw new Error(
			`Konfigurasi test session recorder belum lengkap (nama konfigurasi saja, bukan nilai): ${problems.join(', ')}`
		);
};
