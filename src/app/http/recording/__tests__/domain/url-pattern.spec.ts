import { isDynamicSegment, urlPattern, urlRegexLiteral } from '../../domain/url-pattern';

describe('urlRegexLiteral', () => {
	const toRegExp = (literal: string) => {
		const match = /^\/(.*)\/([a-z]*)$/.exec(literal)!;
		return new RegExp(match[1], match[2]);
	};

	it('cocok dengan ID lain dan query berbeda, tidak cocok dengan path lain', () => {
		const literal = urlRegexLiteral('https://chat.knitto.org/chat/12345?token=abc');
		expect(literal).toBe('/^[a-z][\\w+.-]*:\\/\\/[^/]+\\/chat\\/[^/]+(?:[?#].*)?$/');
		expect(toRegExp(urlRegexLiteral('https://a.test/')).test('https://b.test/x/')).toBe(false);
		expect(toRegExp(urlRegexLiteral('https://a.test/')).test('https://b.test/?q=1')).toBe(true);
		const re = toRegExp(literal);
		expect(re.test('https://chat.knitto.org/chat/99999')).toBe(true);
		expect(re.test('https://chat.knitto.org/chat/99999?token=zzz')).toBe(true);
		expect(re.test('https://chat.knitto.org/chat/99999/info')).toBe(false);
		expect(toRegExp(urlRegexLiteral('https://a.test/laporan.v2')).test('https://a.test/laporanXv2')).toBe(false);
	});
});

describe('urlPattern', () => {
	it('segmen ID dinamis (angka ≥ 3, UUID, hex ≥ 16, token campuran ≥ 12) → *', () => {
		expect(urlPattern('https://chat.knitto.org/chat/12345')).toBe('**/chat/*');
		expect(urlPattern('https://app.test/tiket/3f2b9c1e-8a7d-4e6f-9b0a-1c2d3e4f5a6b/detail')).toBe('**/tiket/*/detail');
		expect(urlPattern('https://app.test/c/5f1e2d3c4b5a69788796a5b4')).toBe('**/c/*');
		expect(urlPattern('https://app.test/room/aB3dE5fG7hJ9')).toBe('**/room/*');
	});

	it('segmen biasa tetap: angka pendek, kata, slug tanpa angka', () => {
		expect(urlPattern('https://app.test/v2/customer/12/edit')).toBe('**/v2/customer/12/edit');
		expect(urlPattern('https://app.test/laporan-penjualan-bulanan')).toBe('**/laporan-penjualan-bulanan');
		expect(isDynamicSegment('dashboard2026')).toBe(true);
		expect(isDynamicSegment('dashboard')).toBe(false);
	});

	it('query dan hash diabaikan nilainya (Live Chat dengan token query)', () => {
		expect(urlPattern('https://chat.knitto.org/chat/98765?token=abc123def456&room=1')).toBe('**/chat/*?**');
		expect(urlPattern('https://app.test/inbox#/thread/77')).toBe('**/inbox#**');
		expect(urlPattern('https://app.test/')).toBe('**/');
	});

	it('karakter glob di path di-escape; URL tidak valid dikembalikan apa adanya', () => {
		expect(urlPattern('https://app.test/a*b')).toBe('**/a\\*b');
		expect(urlPattern('bukan url')).toBe('bukan url');
	});
});
