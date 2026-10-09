import { Client } from 'minio';
import { minioConfig } from '.';

let sharedClient: Client | null = null;

export const getMinioClient = (): Client => {
	if (!sharedClient) {
		sharedClient = new Client({
			endPoint: minioConfig.ENDPOINT,
			port: minioConfig.PORT,
			useSSL: minioConfig.USE_SSL,
			accessKey: minioConfig.ACCESS_KEY,
			secretKey: minioConfig.SECRET_KEY,
			region: minioConfig.REGION
		});
	}
	return sharedClient;
};

/** Dipakai test agar state client tidak bocor antar suite. */
export const resetMinioClient = (): void => {
	sharedClient = null;
};

/**
 * URL objek tanpa signature. Bucket diset public read+write di infra, jadi browser
 * bisa langsung GET/PUT ke `${MINIO_PUBLIC_BASE_URL}/${bucket}/${objectKey}`.
 */
export const buildPublicObjectUrl = (
	objectKey: string,
	settings: { PUBLIC_BASE_URL: string; BUCKET: string } = minioConfig
): string => {
	const base = settings.PUBLIC_BASE_URL.trim().replace(/\/+$/, '');
	const path = objectKey.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
	return `${base}/${encodeURIComponent(settings.BUCKET)}/${path}`;
};

export interface IMinioStatResult {
	size: number;
	metaData?: Record<string, string>;
}

/**
 * Dipakai untuk memverifikasi objek yang benar-benar terunggah (ukuran &
 * content type), bukan hanya nilai yang dikirim client saat presign.
 */
export interface IMinioStatClient {
	statObject(bucket: string, objectKey: string): Promise<IMinioStatResult>;
}

export const statArtifactObject = (
	objectKey: string,
	client: IMinioStatClient = getMinioClient()
): Promise<IMinioStatResult> => client.statObject(minioConfig.BUCKET, objectKey);

export const putArtifactObjectBuffer = async (
	objectKey: string,
	buffer: Buffer,
	contentType: string = 'video/webm',
	client: Client = getMinioClient()
): Promise<void> => {
	await client.putObject(minioConfig.BUCKET, objectKey, buffer, buffer.length, {
		'Content-Type': contentType
	});
};

