import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';

export const GENERATION_KINDS = ['markdown', 'playwright'] as const;
export type TGenerationKind = (typeof GENERATION_KINDS)[number];

export const GENERATION_STATUS = {
	PENDING: 'pending',
	PROCESSING: 'processing',
	COMPLETED: 'completed',
	FAILED: 'failed'
} as const;

export const GENERATION_PROMPT_VERSION = 'v1';

export const isGenerationKind = (kind: string): kind is TGenerationKind =>
	(GENERATION_KINDS as readonly string[]).includes(kind);

export const assertGenerationKind = (kind: string): TGenerationKind => {
	if (!isGenerationKind(kind))
		throw new InvalidParameterException(`Jenis generation tidak dikenal: ${String(kind)}.`);
	return kind;
};

const SYSTEM_PROMPTS: Record<TGenerationKind, string> = {
	markdown: [
		'Kamu asisten QA. Buat ringkasan debugging dalam Bahasa Indonesia berformat Markdown.',
		'Sertakan: identitas test case, hasil, ringkasan langkah, checkpoint, anomali console/network,',
		'dan rekomendasi investigasi. Jangan mengarang data yang tidak ada pada konteks.',
		'Jangan pernah menampilkan kembali nilai sensitif; jika data terlihat terredaksi, biarkan apa adanya.',
		'Balas hanya Markdown tanpa penjelasan pembuka.'
	].join(' '),
	playwright: [
		'Kamu asisten QA automation. Buat draft test Playwright (TypeScript, @playwright/test) dalam Bahasa Indonesia sebagai komentar singkat.',
		'Gunakan action dan kandidat locator dari konteks, tambahkan assertion yang masuk akal, dan tandai asumsi dengan komentar.',
		'Jangan menyertakan value sensitif. Draft ini untuk direview manusia, bukan dijalankan otomatis.',
		'Balas hanya kode TypeScript tanpa penjelasan pembuka.'
	].join(' ')
};

export const buildSystemPrompt = (kind: TGenerationKind): string => SYSTEM_PROMPTS[kind];

/**
 * Membersihkan output AI: membuang code fence untuk draft Playwright dan
 * memastikan hasil tidak kosong.
 */
export const normalizeAiOutput = (kind: TGenerationKind, raw: string): string => {
	const trimmed = (raw ?? '').trim();
	if (!trimmed) throw new InvalidParameterException('Provider AI mengembalikan output kosong.');

	if (kind !== 'playwright') return trimmed;

	const fenced = trimmed.match(/^```(?:ts|tsx|typescript|javascript|js)?\s*\n([\s\S]*?)\n```$/);
	return (fenced ? fenced[1] : trimmed).trim();
};

export const toGenerationResponse = (generation: Entity.IQaRecordingGeneration) => ({
	id_generation: generation.id_generation ?? null,
	id_session: generation.id_session ?? null,
	kind: generation.kind ?? null,
	status: generation.status ?? null,
	model: generation.model ?? null,
	prompt_version: generation.prompt_version ?? null,
	output: generation.output ?? null,
	error_message: generation.error_message ?? null,
	attempt_count: Number(generation.attempt_count ?? 0),
	started_at: generation.started_at ?? null,
	finished_at: generation.finished_at ?? null,
	created_at: generation.created_at ?? null,
	updated_at: generation.updated_at ?? null
});
