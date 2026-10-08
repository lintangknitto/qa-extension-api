import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { AI_PATCH_SYSTEM_PROMPT } from './ai-patch';

/**
 * - markdown: laporan QA (AI)
 * - playwright: script deterministik dari event (tanpa AI)
 * - playwright_ai: patch AI kecil (value/komentar) di atas script deterministik (opsional)
 * - investigation: analisis akar masalah dari rekaman + log Loki dashboard program + codebase memory
 */
export const GENERATION_KINDS = ['markdown', 'playwright', 'playwright_ai', 'investigation'] as const;
export type TGenerationKind = (typeof GENERATION_KINDS)[number];

/** Kind yang dijalankan saat request tidak menyebut `kinds`. */
export const DEFAULT_GENERATION_KINDS: readonly TGenerationKind[] = ['markdown', 'playwright'];

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

const SYSTEM_PROMPTS: Partial<Record<TGenerationKind, string>> = {
	markdown: [
		'Kamu asisten QA senior. Buat ringkasan hasil pengujian dan laporan investigasi debugging yang komprehensif dalam Bahasa Indonesia berformat Markdown.',
		'Sertakan: Identitas Test Case, Status Hasil (PASS/FAIL/BLOCKED), Ringkasan Langkah Pengujian, Checkpoint & Verifikasi, Anomali Console/Network jika ada, serta Rekomendasi/Catatan QA.',
		'Gunakan data faktual yang ada pada konteks. Jangan mengarang data yang tidak ada.',
		'Perhatikan bahwa nomor pada "Langkah Tester" adalah urutan aksi interaksi tester secara kronologis dari awal sampai akhir. Jangan berspekulasi adanya langkah tester yang hilang.',
		'Jangan menampilkan kembali nilai sensitif jika terredaksi.',
		'Balas hanya konten Markdown tanpa penjelasan pembuka/penutup.'
	].join(' '),
	playwright_ai: AI_PATCH_SYSTEM_PROMPT,
	investigation: [
		'Kamu QA engineer senior yang menginvestigasi kegagalan pengujian. Tulis laporan Markdown Bahasa Indonesia berdasarkan konteks: sinyal kegagalan rekaman, log server Loki, dan potongan kode.',
		'Struktur: ## Ringkasan, ## Dugaan Akar Masalah (sebut komponen: frontend/backend/data/infra/test), ## Bukti (kutip baris log persis beserta timestamp & requestId bila ada, dan nomor event rekaman), ## Langkah Tester Terkait, ## Rekomendasi.',
		'Hanya pakai fakta dari konteks. Bila log tidak ditemukan atau query gagal, katakan terus terang dan sebutkan apa yang perlu dicek manual; jangan mengarang isi log.',
		'Bila tingkat keyakinan rendah, nyatakan demikian. Jangan menampilkan nilai sensitif/terredaksi.',
		'Balas hanya konten Markdown tanpa pembuka/penutup.'
	].join(' ')
};

export const buildSystemPrompt = (kind: TGenerationKind): string => {
	const prompt = SYSTEM_PROMPTS[kind];
	if (!prompt) throw new InvalidParameterException(`Generation ${kind} tidak memakai AI.`);
	return prompt;
};

/**
 * Membersihkan output AI: membuang code fence untuk draft Playwright dan
 * memastikan hasil tidak kosong.
 */
export const normalizeAiOutput = (kind: TGenerationKind, raw: string): string => {
	const trimmed = (raw ?? '').trim();
	if (!trimmed) throw new InvalidParameterException('Provider AI mengembalikan output kosong.');

	if (kind !== 'playwright') return trimmed;

	const fencedMatch = trimmed.match(/(?:```(?:ts|tsx|typescript|javascript|js)?\s*\n?)([\s\S]*?)(?:\n?```)/);
	if (fencedMatch && fencedMatch[1]) {
		return fencedMatch[1].trim();
	}

	return trimmed;
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
