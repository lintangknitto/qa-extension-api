import { collectRecordingInfraProblems, type RecordingInfraSettings } from '../recording-infra';

const settings = (publicBaseUrl: string): RecordingInfraSettings => ({
	openAi: { API_KEY: 'k', BASE_URL: 'http://ai', MODEL: 'm' },
	minio: { ENDPOINT: 'minio', ACCESS_KEY: 'a', SECRET_KEY: 's', BUCKET: 'b', PUBLIC_BASE_URL: publicBaseUrl }
});

describe('collectRecordingInfraProblems — MINIO_PUBLIC_BASE_URL', () => {
	it.each(['http://192.168.20.2:9000', 'https://minio.internal', 'HTTP://host:9000/'])('menerima URL absolut http(s): %s', (url) => {
		expect(collectRecordingInfraProblems(settings(url))).toEqual([]);
	});

	it.each(['', '   ', '192.168.20.2:9000', 'ftp://host', 'http://', '/minio'])('menolak nilai kosong/tanpa skema: "%s"', (url) => {
		expect(collectRecordingInfraProblems(settings(url))).toEqual(['MINIO_PUBLIC_BASE_URL']);
	});
});
