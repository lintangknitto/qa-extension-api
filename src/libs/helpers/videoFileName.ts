/**
 * Nama file video run: `<TC> - <judul> - <YYYY-MM-DD HH.mm> - Run <n>.webm` (WIB).
 * Implementasi identik dengan `recording/videoFileName.ts` di extension; ubah keduanya bersamaan.
 */
export const VIDEO_FILE_NAME_MAX_LENGTH = 150;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const FORBIDDEN_CHARS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

// Surrogate tanpa pasangan membuat `encodeURIComponent` melempar error.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

const sanitizePart = (value: string): string =>
	value.replace(FORBIDDEN_CHARS, ' ').replace(LONE_SURROGATE, ' ').replace(/\s+/g, ' ').trim();

/** Potong per code point (emoji tidak terbelah), panjang tetap dihitung dalam unit UTF-16. */
const takeStart = (value: string, maxUnits: number): string => {
	let out = '';
	for (const char of Array.from(value)) {
		if (out.length + char.length > maxUnits) break;
		out += char;
	}
	return out;
};

const takeEnd = (value: string, maxUnits: number): string => {
	let out = '';
	for (const char of Array.from(value).reverse()) {
		if (out.length + char.length > maxUnits) break;
		out = char + out;
	}
	return out;
};

const pad = (value: number): string => String(value).padStart(2, '0');

export const formatWibTimestamp = (date: Date): string => {
	const wib = new Date(date.getTime() + WIB_OFFSET_MS);
	return `${wib.getUTCFullYear()}-${pad(wib.getUTCMonth() + 1)}-${pad(wib.getUTCDate())} ${pad(wib.getUTCHours())}.${pad(wib.getUTCMinutes())}`;
};

export const buildVideoFileName = (input: {
	testCaseNo?: string | null;
	title?: string | null;
	startedAt: Date | string;
	runNumber: number;
}): string => {
	const startedAt = new Date(input.startedAt);
	const timestamp = Number.isNaN(startedAt.getTime()) ? 'tanpa-waktu' : formatWibTimestamp(startedAt);
	const head = sanitizePart(input.testCaseNo ?? '');
	const tail = [timestamp, `Run ${input.runNumber}`].join(' - ') + '.webm';
	const fixed = [head, tail].filter(Boolean).join(' - ');

	let title = sanitizePart(input.title ?? '');
	const room = VIDEO_FILE_NAME_MAX_LENGTH - fixed.length - (title ? 3 : 0);
	if (title.length > room) title = room > 0 ? takeStart(title, room).trim() : '';

	const name = [head, title, tail].filter(Boolean).join(' - ');
	if (name.length <= VIDEO_FILE_NAME_MAX_LENGTH) return name;
	// Nomor TC sangat panjang: pertahankan ekor (waktu + run), buang spasi/titik/pemisah di depan
	// supaya nama lolos validasi key (`name.trim() === name`).
	return takeEnd(name, VIDEO_FILE_NAME_MAX_LENGTH).replace(/^[\s.-]+/, '');
};
