/**
 * Pola glob Playwright untuk `waitForURL`/`toHaveURL`: segmen path yang mirip ID dinamis diganti `*`
 * agar script tetap lolos saat ID percakapan/tiket berbeda di setiap run. Host diganti `**`, sedangkan
 * nilai query dan hash diabaikan (cukup ditandai keberadaannya dengan `?**`/`#**`).
 * `goto` tetap memakai URL persis.
 */

const DIGITS = /^\d{3,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX = /^[0-9a-f]{16,}$/i;
/** Token campuran huruf + angka ≥ 12 karakter (boleh `-`/`_`), mis. ID Firestore/nanoid. */
const MIXED_TOKEN = /^(?=[^/]*[a-z])(?=[^/]*\d)[a-z0-9_-]{12,}$/i;

export const isDynamicSegment = (segment: string): boolean =>
	DIGITS.test(segment) || UUID.test(segment) || HEX.test(segment) || MIXED_TOKEN.test(segment);

/** Karakter yang punya arti khusus di glob Playwright. */
const escapeGlob = (segment: string): string => segment.replace(/[\\*?{}[\]]/g, (ch) => `\\${ch}`);

const LINE_TERMINATORS = /[\r\n\u2028\u2029]/g;

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, (ch) => `\\${ch}`);

/**
 * Literal RegExp JS dengan aturan yang sama (untuk `toHaveURL`, yang mencocokkan string secara persis):
 * segmen dinamis → `[^/]+`, query/hash opsional dan diabaikan.
 */
export const urlRegexLiteral = (url: string): string => {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		// URL tidak valid berasal dari klien: line terminator ditulis sebagai escape agar literal regex tidak pecah.
		return `/^${escapeRegex(url).replace(LINE_TERMINATORS, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`)}$/`;
	}
	const path = parsed.pathname
		.split('/')
		.map((segment) => {
			let decoded = segment;
			try {
				decoded = decodeURIComponent(segment);
			} catch {
				// Segmen dengan % tidak valid dipakai apa adanya.
			}
			return isDynamicSegment(decoded) ? '[^/]+' : escapeRegex(segment);
		})
		.join('\\/');
	// Host apa pun (setara `**` di glob), path di-anchor penuh.
	return `/^[a-z][\\w+.-]*:\\/\\/[^/]+${path}(?:[?#].*)?$/`;
};

export const urlPattern = (url: string): string => {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return url;
	}
	const path = parsed.pathname
		.split('/')
		.map((segment) => {
			const decoded = (() => {
				try {
					return decodeURIComponent(segment);
				} catch {
					return segment;
				}
			})();
			return isDynamicSegment(decoded) ? '*' : escapeGlob(segment);
		})
		.join('/');
	const query = parsed.search ? '?**' : '';
	const hash = !parsed.search && parsed.hash ? '#**' : '';
	return `**${path}${query}${hash}`;
};
