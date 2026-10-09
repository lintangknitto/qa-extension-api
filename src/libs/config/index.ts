import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import packageJson from '../../../package.json';

export const APP_NAME = packageJson.name || 'knitto-rest';
export const APP_VERSION = packageJson.version || '0.0.0';

export const NODE_ENV = process.env.NODE_ENV ?? 'development';
export const DEBUG_QUERY = process.env.DEBUG_QUERY ?? 'false';
export const APP_SECRET_KEY = process.env.APP_SECRET_KEY || '';
export const APP_PORT_HTTP = process.env.APP_PORT_HTTP || '8000';

export const OPENAPI_DOCS_ENABLED = process.env.OPENAPI_DOCS_ENABLED === 'true';

export const postgresConfig = {
	HOST: process.env.POSTGRES_HOST || process.env.DB_HOST_POSTGRES || 'localhost',
	PORT: Number(process.env.POSTGRES_PORT || process.env.DB_PORT_POSTGRES || 5432),
	USER: process.env.POSTGRES_USER || process.env.DB_USER_POSTGRES || 'postgres',
	PASSWORD: process.env.POSTGRES_PASSWORD || process.env.DB_PASS_POSTGRES || 'postgres',
	NAME: process.env.POSTGRES_DB || process.env.DB_NAME_POSTGRES || 'knitto_qa'
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
	BUCKET: process.env.MINIO_BUCKET || 'qa-recording-artifacts',
	/** Host MinIO yang dijangkau browser (bucket public); dipakai untuk URL objek tanpa signature. */
	PUBLIC_BASE_URL: (process.env.MINIO_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '')
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
		'image/png,image/jpeg,image/webp,application/json,text/plain,video/webm'
	)
};

export const PROJECT_ADMIN_LEVELS = csv(
	process.env.PROJECT_ADMIN_LEVELS,
	'ADMIN,QA,SUPERADMIN,IMPLEMENTOR'
).map((level) => level.toUpperCase());

export const embeddingConfig = {
	BASE_URL: process.env.EMBEDDING_BASE_URL || 'http://192.168.20.15:20128/v1',
	API_KEY: process.env.EMBEDDING_API_KEY || '',
	MODEL: process.env.EMBEDDING_MODEL || 'openrouter/openai/text-embedding-3-small',
	DIMENSIONS: Number(process.env.EMBEDDING_DIMENSIONS || 1536)
};

export const grafanaConfig = {
	URL: process.env.GRAFANA_URL || 'http://192.168.20.15:3800',
	SERVICE_ACCOUNT_TOKEN: process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN || '',
	LOKI_UID: process.env.GRAFANA_LOKI_UID || '',
	PROMETHEUS_UID: process.env.GRAFANA_PROMETHEUS_UID || '',
	TEMPO_UID: process.env.GRAFANA_TEMPO_UID || 'efh5mi0xofqioe',
	ALLOW_ANNOTATION: process.env.ALLOW_ANNOTATION_OPERATION === 'true',
	ALLOW_SILENCE: process.env.ALLOW_SILENCE_OPERATION === 'true'
};

export const githubConfig = {
	TOKEN: process.env.GITHUB_TOKEN || ''
};

