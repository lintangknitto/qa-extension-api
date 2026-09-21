import { minioConfig } from '..';
import { createPresignedGetUrl, createPresignedPutUrl, type IMinioPresigner } from '../minioClient';

const fakePresigner = (): IMinioPresigner & { calls: Array<{ bucket: string; key: string; expiry: number }> } => {
	const calls: Array<{ bucket: string; key: string; expiry: number }> = [];
	return {
		calls,
		presignedPutObject: async (bucket, key, expiry) => {
			calls.push({ bucket, key, expiry });
			return `https://minio.test/${bucket}/${key}?upload=1`;
		},
		presignedGetObject: async (bucket, key, expiry) => {
			calls.push({ bucket, key, expiry });
			return `https://minio.test/${bucket}/${key}?download=1`;
		}
	};
};

describe('minioClient presigner', () => {
	it('meneruskan bucket, object key, dan expiry untuk presigned upload', async () => {
		const client = fakePresigner();
		const url = await createPresignedPutUrl('sessions/1/screenshot/a.png', 900, client);

		expect(url).toContain('upload=1');
		expect(client.calls).toEqual([
			{ bucket: minioConfig.BUCKET, key: 'sessions/1/screenshot/a.png', expiry: 900 }
		]);
	});

	it('meneruskan bucket, object key, dan expiry untuk presigned download', async () => {
		const client = fakePresigner();
		const url = await createPresignedGetUrl('sessions/2/network_body/b.json', 600, client);

		expect(url).toContain('download=1');
		expect(client.calls).toEqual([
			{ bucket: minioConfig.BUCKET, key: 'sessions/2/network_body/b.json', expiry: 600 }
		]);
	});
});
