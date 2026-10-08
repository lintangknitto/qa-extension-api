import { renderScript, renderStep, type CodegenInput, type CodegenStep } from './playwright-codegen';

/**
 * AI hanya boleh mengusulkan patch kecil per langkah di atas script deterministik:
 * mengganti nilai (fill/select/press) atau menambah komentar. Locator, jenis aksi,
 * jumlah, dan urutan langkah tidak bisa diubah — server menolak patch di luar itu.
 */

export const MAX_PATCH_COMMENT_LENGTH = 200;
export const MAX_PATCH_VALUE_LENGTH = 1000;

const VALUE_EDITABLE_ACTIONS = new Set(['fill', 'selectOption', 'press']);
const ALLOWED_PATCH_KEYS = new Set(['step', 'value', 'comment']);

export interface AiPatch {
	step: number;
	value?: string;
	comment?: string;
}

export interface RejectedPatch {
	patch: unknown;
	reason: string;
}

export interface PatchValidationResult {
	accepted: AiPatch[];
	rejected: RejectedPatch[];
}

export const AI_PATCH_SYSTEM_PROMPT = [
	'Kamu QA Automation Engineer. Kamu menerima script Playwright yang dibuat otomatis dari rekaman tester dan SUDAH 1:1 dengan aksi tester.',
	'Tugasmu hanya mengusulkan perbaikan kecil per langkah:',
	'(a) komentar singkat Bahasa Indonesia yang menjelaskan maksud langkah, dan/atau',
	'(b) mengganti nilai input (hanya langkah bertanda [nilai bisa diubah]) bila nilainya jelas data sekali pakai (mis. nomor unik/timestamp) yang akan bentrok saat dijalankan ulang.',
	'DILARANG mengubah locator, jenis aksi, menambah, menghapus, atau menukar urutan langkah.',
	`Komentar maksimal ${MAX_PATCH_COMMENT_LENGTH} karakter, satu baris. Jangan menulis ulang script.`,
	'Balas HANYA JSON tanpa penjelasan: {"patches":[{"step":<nomor>,"comment":"..."},{"step":<nomor>,"value":"..."}]}. Boleh {"patches":[]} bila tidak ada yang perlu diubah.'
].join(' ');

/** Konteks user untuk AI: langkah bernomor + penanda langkah yang nilainya boleh diubah. */
export const buildPatchUserPrompt = (session: CodegenInput['session'], steps: CodegenStep[]): string => {
	const lines = steps.map((step) => {
		const editable = VALUE_EDITABLE_ACTIONS.has(step.action) && !step.secretEnv ? ' [nilai bisa diubah]' : '';
		return `${step.no}. ${renderStep(step)}${editable}`;
	});
	return [
		`Test case: ${[session.test_case_no, session.title].filter(Boolean).join(' ') || '-'}`,
		'',
		'Langkah:',
		...lines
	].join('\n');
};

const extractJsonObject = (raw: string): unknown => {
	const trimmed = (raw ?? '').trim();
	const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
	const body = fenced ? fenced[1] : trimmed;
	const start = body.indexOf('{');
	const end = body.lastIndexOf('}');
	if (start === -1 || end <= start) throw new Error('Respon AI patch bukan JSON.');
	return JSON.parse(body.slice(start, end + 1));
};

/** Mengurai respon AI menjadi daftar patch mentah (belum divalidasi). */
export const parsePatchResponse = (raw: string): unknown[] => {
	const parsed = extractJsonObject(raw) as { patches?: unknown };
	if (!parsed || !Array.isArray(parsed.patches)) throw new Error('Respon AI patch tidak memiliki array "patches".');
	return parsed.patches;
};

const valueError = (step: CodegenStep, value: unknown): string | null => {
	if (value === undefined) return null;
	if (typeof value !== 'string' || value.length > MAX_PATCH_VALUE_LENGTH) return `Nilai harus string ≤ ${MAX_PATCH_VALUE_LENGTH} karakter.`;
	if (!VALUE_EDITABLE_ACTIONS.has(step.action)) return `Nilai langkah ${step.no} (${step.action}) tidak boleh diubah.`;
	if (step.secretEnv) return `Langkah ${step.no} memakai nilai sensitif dari env.`;
	return null;
};

const commentError = (comment: unknown): string | null => {
	if (comment === undefined) return null;
	if (typeof comment !== 'string' || comment.length > MAX_PATCH_COMMENT_LENGTH || /[\r\n]/.test(comment)) {
		return `Komentar harus satu baris ≤ ${MAX_PATCH_COMMENT_LENGTH} karakter.`;
	}
	return null;
};

const resolveStep = (steps: CodegenStep[], stepNo: unknown, seen: Set<number>): CodegenStep | string => {
	const step = typeof stepNo === 'number' && Number.isInteger(stepNo) ? steps.find((s) => s.no === stepNo) : undefined;
	if (!step) return `Langkah ${typeof stepNo === 'number' ? stepNo : JSON.stringify(stepNo ?? null)} tidak ada.`;
	if (seen.has(step.no)) return `Patch ganda untuk langkah ${step.no}.`;
	return step;
};

/** Validasi satu patch: mengembalikan patch bersih, atau alasan penolakan. */
const checkPatch = (steps: CodegenStep[], patch: unknown, seen: Set<number>): AiPatch | string => {
	if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return 'Patch harus berupa object.';
	const record = patch as Record<string, unknown>;
	const extraKeys = Object.keys(record).filter((key) => !ALLOWED_PATCH_KEYS.has(key));
	if (extraKeys.length > 0) return `Field tidak diizinkan: ${extraKeys.join(', ')} (locator/aksi/urutan tidak boleh diubah).`;

	const step = resolveStep(steps, record.step, seen);
	if (typeof step === 'string') return step;
	if (record.value === undefined && record.comment === undefined) return 'Patch kosong.';

	const error = valueError(step, record.value) ?? commentError(record.comment);
	if (error) return error;

	const comment = typeof record.comment === 'string' ? record.comment.trim() : '';
	return {
		step: step.no,
		...(typeof record.value === 'string' ? { value: record.value } : {}),
		...(comment ? { comment } : {})
	};
};

export const validatePatches = (steps: CodegenStep[], rawPatches: unknown[]): PatchValidationResult => {
	const accepted: AiPatch[] = [];
	const rejected: RejectedPatch[] = [];
	const seen = new Set<number>();
	for (const patch of rawPatches) {
		const result = checkPatch(steps, patch, seen);
		if (typeof result === 'string') {
			rejected.push({ patch, reason: result });
			continue;
		}
		seen.add(result.step);
		accepted.push(result);
	}
	return { accepted, rejected };
};

/** Menerapkan patch yang lolos validasi ke salinan langkah; langkah asli tidak berubah. */
export const applyPatches = (steps: CodegenStep[], patches: AiPatch[]): CodegenStep[] => {
	const byStep = new Map(patches.map((patch) => [patch.step, patch]));
	const patched = steps.map((step) => {
		const patch = byStep.get(step.no);
		const copy: CodegenStep = { ...step, sequences: [...step.sequences], comments: [...step.comments] };
		if (!patch) return copy;
		if (patch.value !== undefined) {
			copy.comments.push(`AI: nilai asli rekaman ${JSON.stringify(step.value ?? '')}`);
			copy.value = patch.value;
		}
		if (patch.comment) copy.comments.unshift(`AI: ${patch.comment}`);
		return copy;
	});
	// Invarian: struktur aksi identik dengan script deterministik.
	const signature = (list: CodegenStep[]) => list.map((s) => `${s.no}|${s.action}|${s.locator}|${s.secretEnv ?? ''}`).join('\n');
	if (signature(patched) !== signature(steps)) throw new Error('Patch AI mengubah struktur langkah.');
	return patched;
};

export const renderPatchedScript = (
	session: CodegenInput['session'],
	steps: CodegenStep[],
	result: PatchValidationResult
): string => {
	const header = `Patch AI: ${result.accepted.length} diterapkan, ${result.rejected.length} ditolak`;
	const rejectedNotes = result.rejected.map((r) => `ditolak: ${r.reason}`);
	return renderScript(session, applyPatches(steps, result.accepted), [], [header, ...rejectedNotes]);
};
