import {
	applyPatches,
	buildPatchUserPrompt,
	parsePatchResponse,
	renderPatchedScript,
	validatePatches
} from '../../domain/ai-patch';
import type { CodegenStep } from '../../domain/playwright-codegen';

const step = (no: number, action: CodegenStep['action'], locator: string, extra: Partial<CodegenStep> = {}): CodegenStep => ({
	no,
	action,
	locator,
	ambiguous: false,
	sequences: [no],
	comments: [],
	...extra
});

const steps: CodegenStep[] = [
	step(1, 'goto', '', { value: 'https://a.test/' }),
	step(2, 'fill', "getByLabel('No Order', { exact: true })", { value: 'ORD-1696000000' }),
	step(3, 'fill', "getByLabel('Password', { exact: true })", { secretEnv: 'QA_SECRET_1' }),
	step(4, 'click', "getByRole('button', { name: 'Simpan', exact: true })")
];
const session = { test_case_no: 'TC-9', title: 'Buat order' };

describe('ai-patch', () => {
	it('prompt user menandai langkah yang nilainya boleh diubah (bukan secret)', () => {
		const prompt = buildPatchUserPrompt(session, steps);
		expect(prompt).toContain("2. await page.getByLabel('No Order', { exact: true }).fill('ORD-1696000000'); [nilai bisa diubah]");
		expect(prompt).not.toMatch(/3\. .*\[nilai bisa diubah\]/);
		expect(prompt).not.toMatch(/4\. .*\[nilai bisa diubah\]/);
	});

	it('parsePatchResponse toleran terhadap code fence dan teks pembuka', () => {
		expect(parsePatchResponse('Berikut:\n```json\n{"patches":[{"step":4,"comment":"Simpan"}]}\n```')).toEqual([{ step: 4, comment: 'Simpan' }]);
		expect(() => parsePatchResponse('tidak ada json')).toThrow(/bukan JSON/);
		expect(() => parsePatchResponse('{"ok":true}')).toThrow(/patches/);
	});

	it('menerima patch value pada fill dan komentar pada langkah mana pun', () => {
		const result = validatePatches(steps, [
			{ step: 2, value: 'ORD-<unik>', comment: 'Nomor order harus unik' },
			{ step: 4, comment: 'Simpan order' }
		]);
		expect(result.rejected).toEqual([]);
		expect(result.accepted).toEqual([
			{ step: 2, value: 'ORD-<unik>', comment: 'Nomor order harus unik' },
			{ step: 4, comment: 'Simpan order' }
		]);
	});

	it('menolak patch yang mengubah locator/aksi/urutan atau menambah langkah', () => {
		const result = validatePatches(steps, [
			{ step: 4, locator: "getByText('Simpan')" },
			{ step: 4, action: 'dblclick' },
			{ step: 5, comment: 'langkah baru' },
			{ insertAfter: 2, action: 'click' },
			{ step: 4, value: 'x' },
			{ step: 3, value: 'bocor' },
			{ step: 1, comment: 'baris1\nbaris2' },
			{ step: 2, comment: 'a' },
			{ step: 2, comment: 'ganda' },
			'bukan object'
		]);
		expect(result.accepted).toEqual([{ step: 2, comment: 'a' }]);
		expect(result.rejected.map((r) => r.reason)).toEqual([
			expect.stringContaining('Field tidak diizinkan: locator'),
			expect.stringContaining('Field tidak diizinkan: action'),
			'Langkah 5 tidak ada.',
			expect.stringContaining('Field tidak diizinkan: insertAfter'),
			expect.stringContaining('tidak boleh diubah'),
			expect.stringContaining('sensitif'),
			expect.stringContaining('satu baris'),
			'Patch ganda untuk langkah 2.',
			'Patch harus berupa object.'
		]);
	});

	it('applyPatches tidak mengubah struktur dan tidak memutasi langkah asli', () => {
		const original = JSON.stringify(steps);
		const patched = applyPatches(steps, [{ step: 2, value: 'ORD-X', comment: 'unik' }]);
		expect(JSON.stringify(steps)).toBe(original);
		expect(patched.map((s) => [s.no, s.action, s.locator])).toEqual(steps.map((s) => [s.no, s.action, s.locator]));
		expect(patched[1].value).toBe('ORD-X');
		expect(patched[1].comments).toEqual(['AI: unik', 'AI: nilai asli rekaman "ORD-1696000000"']);
	});

	it('renderPatchedScript mencatat jumlah patch diterapkan/ditolak', () => {
		const result = validatePatches(steps, [{ step: 2, value: 'ORD-X' }, { step: 4, locator: 'x' }]);
		const script = renderPatchedScript(session, steps, result);
		expect(script).toContain('// Patch AI: 1 diterapkan, 1 ditolak');
		expect(script).toContain("await page.getByLabel('No Order', { exact: true }).fill('ORD-X');");
		expect(script).toContain("await page.getByRole('button', { name: 'Simpan', exact: true }).click();");
		expect(script.match(/^\tawait page\./gm)).toHaveLength(4);
	});
});
