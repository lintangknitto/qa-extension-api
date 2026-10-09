import { buildPublicObjectUrl } from '../minioClient';

describe('buildPublicObjectUrl', () => {
	const settings = { PUBLIC_BASE_URL: 'http://192.168.20.2:9000', BUCKET: 'qa-recording-artifacts' };

	it('menggabungkan base URL, bucket, dan object key tanpa signature', () => {
		expect(buildPublicObjectUrl('sessions/1/screenshot/a.png', settings)).toBe(
			'http://192.168.20.2:9000/qa-recording-artifacts/sessions/1/screenshot/a.png'
		);
	});

	it('mengabaikan trailing slash base dan leading slash key', () => {
		expect(buildPublicObjectUrl('/sessions/2/video/b.webm', { ...settings, PUBLIC_BASE_URL: 'http://minio.local:9000//' })).toBe(
			'http://minio.local:9000/qa-recording-artifacts/sessions/2/video/b.webm'
		);
	});

	it('meng-encode tiap segmen path tanpa meng-encode slash', () => {
		expect(buildPublicObjectUrl('sessions/3/file name#1?.json', settings)).toBe(
			'http://192.168.20.2:9000/qa-recording-artifacts/sessions/3/file%20name%231%3F.json'
		);
	});
});
