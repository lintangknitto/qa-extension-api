import { Client } from 'minio';
import { minioConfig } from '.';

/**
 * Presigner minimal supaya adapter bisa diuji tanpa instance MinIO nyata.
 */
export interface IMinioPresigner {
	presignedPutObject(bucket: string, objectKey: string, expirySeconds: number): Promise<string>;
	presignedGetObject(bucket: string, objectKey: string, expirySeconds: number): Promise<string>;
}

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

export const createPresignedPutUrl = (
	objectKey: string,
	expirySeconds: number,
	client: IMinioPresigner = getMinioClient()
): Promise<string> => client.presignedPutObject(minioConfig.BUCKET, objectKey, expirySeconds);

export const createPresignedGetUrl = (
	objectKey: string,
	expirySeconds: number,
	client: IMinioPresigner = getMinioClient()
): Promise<string> => client.presignedGetObject(minioConfig.BUCKET, objectKey, expirySeconds);

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
