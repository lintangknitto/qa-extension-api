/**
 * Nama file video run: `<TC> - <judul> - <YYYY-MM-DD HH.mm> - Run <n>.webm` (WIB).
 * Implementasi identik dengan `recording/videoFileName.ts` di extension; ubah keduanya bersamaan.
 */
export const VIDEO_FILE_NAME_MAX_LENGTH = 150;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const FORBIDDEN_CHARS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

const sanitizePart = (value: string): string =>
	value.replace(FORBIDDEN_CHARS, ' ').replace(/\s+/g, ' ').trim();

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
	if (title.length > room) title = room > 0 ? title.slice(0, room).trim() : '';

	const name = [head, title, tail].filter(Boolean).join(' - ');
	return name.length > VIDEO_FILE_NAME_MAX_LENGTH ? name.slice(name.length - VIDEO_FILE_NAME_MAX_LENGTH) : name;
};
