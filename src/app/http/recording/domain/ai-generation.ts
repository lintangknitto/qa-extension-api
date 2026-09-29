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
		'Kamu asisten QA senior. Buat ringkasan hasil pengujian dan laporan investigasi debugging yang komprehensif dalam Bahasa Indonesia berformat Markdown.',
		'Sertakan: Identitas Test Case, Status Hasil (PASS/FAIL/BLOCKED), Ringkasan Langkah Pengujian, Checkpoint & Verifikasi, Anomali Console/Network jika ada, serta Rekomendasi/Catatan QA.',
		'Gunakan data faktual yang ada pada konteks. Jangan mengarang data yang tidak ada.',
		'Perhatikan bahwa nomor pada "Langkah Tester" adalah urutan aksi interaksi tester secara kronologis dari awal sampai akhir. Jangan berspekulasi adanya langkah tester yang hilang.',
		'Jangan menampilkan kembali nilai sensitif jika terredaksi.',
		'Balas hanya konten Markdown tanpa penjelasan pembuka/penutup.'
	].join(' '),
	playwright: [
		'Kamu adalah QA Automation Engineer handal yang mengonversi rekaman interaksi tester menjadi skrip otomasi Playwright (TypeScript, @playwright/test) yang 100% executable dan akurat mereplikasi gerakan tester.',
		'ATURAN UTAMA:',
		'1. Buat test lengkap: import { test, expect } from "@playwright/test"; test("...", async ({ page }) => { ... });',
		'2. Buka URL target di awal dengan `await page.goto(...)` sesuai target URL atau event navigasi pertama.',
		'3. Ikuti urutan langkah tester secara kronologis dan presisi 1:1. Gunakan `Primary Locator` yang tercantum di setiap langkah.',
		'4. Gunakan Playwright locators standar: page.getByTestId(), page.getByRole(), page.getByLabel(), page.getByPlaceholder(), page.getByText(), atau page.locator().',
		'5. Prioritaskan locator semantik (getByRole, getByPlaceholder, getByTestId, getByLabel) daripada selector CSS path turunan (seperti div > svg > path) jika tombol/elemen interaktif induknya teridentifikasi.',
		'6. Untuk aksi input/ketik, gunakan `await ...fill("...")`. Jika terdapat event [INPUT] dan [CHANGE] berturut-turut pada elemen yang sama dengan nilai yang sama, gabungkan menjadi satu pemanggilan `.fill(...)`.',
		'7. Untuk aksi tombol keyboard [KEYDOWN], gunakan `await ...press("Key")` (contoh: .press("Enter")).',
		'8. Untuk SETIAP aksi klik [CLICK], WAJIB tuliskan `await ...click();` secara utuh. Jangan pernah melewatkan klik tombol (seperti tombol kirim, simpan, ikon, menu, atau button submit).',
		'9. Untuk aksi dropdown/select, gunakan `await ...selectOption("...")`.',
		'10. Untuk aksi centang/checkbox, gunakan `await ...check()` atau `await ...uncheck()`.',
		'11. Sertakan assertion `await expect(...)` yang bermakna pada titik-titik penting, checkpoint tester, dan verifikasi akhir (misal: verifikasi form kosong/terisi, status pesan, URL stabil).',
		'12. JANGAN PERNAH menyertakan klik atau interaksi pada widget internal tester (seperti #qa-knitto-fab-host atau overlay perekam).',
		'13. Tulis setiap baris aksi Playwright dalam satu baris utuh (single-line) yang jelas, misalnya `await page.getByRole("button", { name: "Kirim" }).click();` alih-alih memecahnya menjadi banyak baris.',
		'14. Pastikan semua alur interaksi tester, termasuk pengetikan pesan, penekanan tombol Enter [KEYDOWN], dan klik tombol kirim/submit [CLICK] ditulis secara lengkap dan tuntas dari awal hingga akhir.',
		'15. JANGAN membuat asumsi atau menebak-nebak selector generic jika locator sudah disediakan secara jelas pada data langkah.',
		'16. JANGAN menuliskan komentar spekulatif seperti "// Asumsi: ...". Tulis kode nyata yang siap dieksekusi langsung oleh runner Playwright maupun Replay Engine di browser.',
		'17. Balas HANYA kode TypeScript murni tanpa markdown code block / explanation pembuka.'
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
