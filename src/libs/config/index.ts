import packageJson from '../../../package.json';

export const APP_NAME = packageJson.name || 'knitto-rest';
export const APP_VERSION = packageJson.version || '0.0.0';

export const NODE_ENV = process.env.NODE_ENV ?? 'development';
export const DEBUG_QUERY = process.env.DEBUG_QUERY ?? 'true';
export const APP_SECRET_KEY = process.env.APP_SECRET_KEY || 'secret';
export const APP_PORT_HTTP = String(process.env.APP_PORT_HTTP) || '8000';

export const OPENAPI_DOCS_ENABLED = process.env.OPENAPI_DOCS_ENABLED === 'true';

export const mysqlConfig = {
	HOST: process.env.DB_HOST_MYSQL || 'localhost',
	NAME: process.env.DB_NAME_MYSQL || 'db',
	USER: process.env.DB_USER_MYSQL || 'root',
	PORT: process.env.DB_PORT_MYSQL || 3306,
	PASSWORD: process.env.DB_PASS_MYSQL || ''
};

export const rabbitMQConfig = {
	URL: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
	EXCHANGE: process.env.RABBITMQ_EXCHANGE || 'noExchange'
};

/**
 * Fitur test session recorder bersifat opt-in supaya deployment lama tidak
 * ikut gagal saat konfigurasi AI/MinIO belum tersedia.
 */
export const RECORDING_FEATURE_ENABLED = process.env.RECORDING_FEATURE_ENABLED === 'true';

export const openAiConfig = {
	API_KEY: process.env.OPENAI_API_KEY || '',
	BASE_URL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
	MODEL: process.env.OPENAI_MODEL || '',
	TIMEOUT_MS: Number(process.env.OPENAI_TIMEOUT_MS || 60000),
	MAX_OUTPUT_TOKENS: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 4000)
};

export const minioConfig = {
	ENDPOINT: process.env.MINIO_ENDPOINT || '',
	PORT: Number(process.env.MINIO_PORT || 9000),
	USE_SSL: process.env.MINIO_USE_SSL === 'true',
	REGION: process.env.MINIO_REGION || 'us-east-1',
	ACCESS_KEY: process.env.MINIO_ACCESS_KEY || '',
	SECRET_KEY: process.env.MINIO_SECRET_KEY || '',
	BUCKET: process.env.MINIO_BUCKET || 'qa-recording-artifacts'
};

const csv = (value: string | undefined, fallback: string): string[] =>
	(value ?? fallback)
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);

export const recordingConfig = {
	UPLOAD_MAX_BYTES: Number(process.env.RECORDING_UPLOAD_MAX_BYTES || 10 * 1024 * 1024),
	PRESIGN_EXPIRY_SECONDS: Number(process.env.RECORDING_PRESIGN_EXPIRY_SECONDS || 900),
	NETWORK_BODY_MAX_BYTES: Number(process.env.RECORDING_NETWORK_BODY_MAX_BYTES || 256 * 1024),
	ARTIFACT_CONTENT_TYPES: csv(
		process.env.RECORDING_ARTIFACT_CONTENT_TYPES,
		'image/png,image/jpeg,image/webp,application/json,text/plain'
	)
};

/**
 * Level user yang boleh mengelola master project. Dibuat konfigurabel karena
 * daftar level dapat berbeda antar deployment.
 */
export const PROJECT_ADMIN_LEVELS = csv(
	process.env.PROJECT_ADMIN_LEVELS,
	'ADMIN,QA,SUPERADMIN,IMPLEMENTOR'
).map((level) => level.toUpperCase());
