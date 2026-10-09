import { buildVideoFileName, VIDEO_FILE_NAME_MAX_LENGTH } from '../videoFileName';

describe('buildVideoFileName', () => {
	it('memformat TC, judul, waktu WIB, dan nomor run', () => {
		expect(buildVideoFileName({ testCaseNo: 'TC-001', title: 'Login berhasil', startedAt: '2026-10-09T03:05:00Z', runNumber: 2 }))
			.toBe('TC-001 - Login berhasil - 2026-10-09 10.05 - Run 2.webm');
	});

	it('mengganti karakter terlarang Windows dan kontrol, merapikan spasi', () => {
		expect(buildVideoFileName({ testCaseNo: 'TC/2', title: 'a:b*c?"d"<e>|f\\g\u0001  h', startedAt: '2026-01-31T20:00:00Z', runNumber: 1 }))
			.toBe('TC 2 - a b c d e f g h - 2026-02-01 03.00 - Run 1.webm');
	});

	it('memotong judul bila melebihi batas panjang', () => {
		const name = buildVideoFileName({ testCaseNo: 'TC-9', title: 'x'.repeat(300), startedAt: '2026-10-09T00:00:00Z', runNumber: 12 });
		expect(name.length).toBeLessThanOrEqual(VIDEO_FILE_NAME_MAX_LENGTH);
		expect(name.startsWith('TC-9 - xxx')).toBe(true);
		expect(name.endsWith(' - 2026-10-09 07.00 - Run 12.webm')).toBe(true);
	});

	it('melewati TC/judul kosong', () => {
		expect(buildVideoFileName({ testCaseNo: null, title: '', startedAt: '2026-10-09T00:00:00Z', runNumber: 1 }))
			.toBe('2026-10-09 07.00 - Run 1.webm');
	});
});
