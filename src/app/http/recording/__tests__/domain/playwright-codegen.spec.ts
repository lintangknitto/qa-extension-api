import type { IAiInputEvent } from '../../domain/ai-input';
import { generatePlaywrightScript, quoteJs } from '../../domain/playwright-codegen';

const T0 = Date.parse('2026-10-08T03:00:00.000Z');

const make = () => {
	let sequence = 0;
	let clock = T0;
	const events: IAiInputEvent[] = [];
	const add = (payload: Record<string, unknown>, gapMs = 3000) => {
		clock += gapMs;
		sequence += 1;
		events.push({ type: 'action', sequence, occurredAt: new Date(clock).toISOString(), url: null, payload });
		return sequence;
	};
	return { events, add };
};

const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, ...extra });

/** Alur 13 aksi tester: login → tambah customer → simpan. */
const recordFlow = (add: ReturnType<typeof make>['add'], suffix = '') => {
	add({ action: 'navigation', url: 'https://app.example.test/login' });
	add({ action: 'input', unique_locator: "getByPlaceholder('Username', { exact: true })", element: el('INPUT'), value: 'qa' });
	add({ action: 'input', unique_locator: "getByPlaceholder('Username', { exact: true })", element: el('INPUT'), value: `qa.tester${suffix}` }, 400);
	add({ action: 'input', unique_locator: "getByLabel('Password', { exact: true })", element: el('INPUT', { type: 'password' }), value: null, value_redacted: true });
	add({ action: 'click', unique_locator: "getByRole('button', { name: 'Masuk', exact: true })", element: el('BUTTON') });
	add({ action: 'navigation', url: 'https://app.example.test/dashboard' }, 600);
	add({ action: 'click', unique_locator: "getByRole('link', { name: 'Customer', exact: true })", element: el('A') });
	add({ action: 'click', unique_locator: "getByRole('button', { name: 'Tambah Customer', exact: true })", element: el('BUTTON') });
	add({ action: 'input', unique_locator: "getByLabel('Nama Customer', { exact: true })", element: el('INPUT'), value: `PT Maju${suffix}` });
	add({ action: 'change', unique_locator: "getByLabel('Nama Customer', { exact: true })", element: el('INPUT'), value: `PT Maju${suffix}` }, 50);
	add({ action: 'change', unique_locator: "getByLabel('Kota', { exact: true })", element: el('SELECT'), value: 'BDG', selectedText: 'Bandung' });
	add({ action: 'click', locators: ["getByRole('checkbox').nth(1)"], ambiguous: true, element: el('INPUT', { type: 'checkbox' }) });
	add({ action: 'change', locators: ["getByRole('checkbox').nth(1)"], ambiguous: true, element: el('INPUT', { type: 'checkbox' }), checked: true }, 30);
	add({ action: 'click', unique_locator: "getByRole('button', { name: 'Simpan', exact: true })", element: el('BUTTON') });
};

describe('playwright-codegen', () => {
	const session = { test_case_no: 'TC1-1', title: 'Tambah customer', target_url: 'https://app.example.test/login' };

	it('menghasilkan script 1:1 dengan aturan penggabungan terdefinisi', () => {
		const { events, add } = make();
		recordFlow(add);
		const { script, steps } = generatePlaywrightScript({ session, events, checkpoints: [{ sequence: 14, note: 'Toast "berhasil" muncul' }] });

		expect(script).toBe(`import { test, expect } from '@playwright/test';

test('TC1-1 Tambah customer', async ({ page }) => {
	// Nilai sensitif diambil dari env: QA_SECRET_1
	await page.goto('https://app.example.test/login');
	await page.getByPlaceholder('Username', { exact: true }).fill('qa.tester');
	await page.getByLabel('Password', { exact: true }).fill(process.env.QA_SECRET_1 ?? '');
	await page.getByRole('button', { name: 'Masuk', exact: true }).click();
	await page.waitForURL('https://app.example.test/dashboard');
	await page.getByRole('link', { name: 'Customer', exact: true }).click();
	await page.getByRole('button', { name: 'Tambah Customer', exact: true }).click();
	await page.getByLabel('Nama Customer', { exact: true }).fill('PT Maju');
	await page.getByLabel('Kota', { exact: true }).selectOption({ label: 'Bandung' });
	// ⚠ locator tidak unik saat direkam
	await page.getByRole('checkbox').nth(1).check();
	await page.getByRole('button', { name: 'Simpan', exact: true }).click();
	// checkpoint: Toast "berhasil" muncul
	await expect(page).toHaveURL('https://app.example.test/dashboard');
});
`);
		expect(steps.map((s) => s.action)).toEqual([
			'goto', 'fill', 'fill', 'click', 'waitForURL', 'click', 'click', 'fill', 'selectOption', 'check', 'click'
		]);
		// Setiap event sumber terpetakan ke tepat satu langkah.
		expect(steps.flatMap((s) => s.sequences).sort((a, b) => a - b)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
	});

	it('event input checkbox (value "on") di antara click & change tetap jadi satu check()', () => {
		const { events, add } = make();
		const loc = "getByRole('checkbox', { name: 'Kirim Ekspres', exact: true })";
		add({ action: 'click', unique_locator: loc, element: el('INPUT', { type: 'checkbox' }) });
		add({ action: 'input', unique_locator: loc, element: el('INPUT', { type: 'checkbox' }), value: 'on' }, 10);
		add({ action: 'change', unique_locator: loc, element: el('INPUT', { type: 'checkbox' }), checked: true }, 10);
		const { steps } = generatePlaywrightScript({ session, events, checkpoints: [] });
		expect(steps.filter((s) => s.action !== 'goto').map((s) => s.action)).toEqual(['check']);
	});

	it('output byte-identik untuk input yang sama', () => {
		const a = make();
		recordFlow(a.add);
		const b = make();
		recordFlow(b.add);
		expect(generatePlaywrightScript({ session, events: a.events, checkpoints: [] }).script).toBe(
			generatePlaywrightScript({ session, events: b.events, checkpoints: [] }).script
		);
	});

	it('rekaman panjang berulang (140 event) tidak dipadatkan', () => {
		const { events, add } = make();
		for (let i = 0; i < 10; i++) recordFlow(add, `-${i}`);
		const { steps, script } = generatePlaywrightScript({ session, events, checkpoints: [] });
		expect(events).toHaveLength(140);
		expect(steps).toHaveLength(110);
		expect(steps.filter((s) => s.action === 'goto')).toHaveLength(10);
		for (let i = 0; i < 10; i++) expect(script).toContain(`fill('PT Maju-${i}')`);
	});

	it('navigasi lambat setelah klik tetap goto, dan redirect beruntun digabung', () => {
		const { events, add } = make();
		add({ action: 'navigation', url: 'https://a.test/' });
		add({ action: 'click', unique_locator: "getByRole('link', { name: 'Masuk', exact: true })", element: el('A') });
		add({ action: 'navigation', url: 'https://a.test/sso' }, 300);
		add({ action: 'navigation', url: 'https://a.test/home' }, 500);
		add({ action: 'navigation', url: 'https://a.test/manual' }, 10000);
		const { steps } = generatePlaywrightScript({ session, events, checkpoints: [] });
		expect(steps.map((s) => [s.action, s.value ?? s.locator])).toEqual([
			['goto', 'https://a.test/'],
			['click', "getByRole('link', { name: 'Masuk', exact: true })"],
			['waitForURL', 'https://a.test/home'],
			['goto', 'https://a.test/manual']
		]);
	});

	it('mengabaikan event widget internal dan memakai fallback locator data lama', () => {
		const { events, add } = make();
		add({ action: 'navigation', url: 'https://a.test/' });
		add({ action: 'click', locators: ["locator('#qa-knitto-fab-host')"], element: el('DIV', { id: 'qa-knitto-fab-host' }) });
		add({ action: 'click', locators: ["page.getByRole('button', { name: 'Kirim' })", "getByText('Kirim')"], element: el('BUTTON') });
		add({ action: 'keydown', locators: ["getByPlaceholder('Ketik pesan')"], key: 'Enter', element: el('TEXTAREA') });
		const { steps } = generatePlaywrightScript({ session, events, checkpoints: [] });
		expect(steps.map((s) => `${s.action} ${s.locator}`)).toEqual([
			'goto ',
			"click getByRole('button', { name: 'Kirim' })",
			"press getByPlaceholder('Ketik pesan')"
		]);
	});

	it('quoteJs meng-escape kutip, backslash, dan newline', () => {
		expect(quoteJs("a'b\\c\nd")).toBe("'a\\'b\\\\c\\nd'");
	});

	it('memakai target_url bila tidak ada aksi', () => {
		const { script } = generatePlaywrightScript({ session, events: [], checkpoints: [] });
		expect(script).toContain("await page.goto('https://app.example.test/login');");
	});
});

describe('playwright-codegen data rekaman nyata', () => {
	const chatSession = { test_case_no: 'TC-CHAT-1', title: 'Kirim pesan', target_url: 'https://chat.knitto.org/chat' };
	const textarea = { tagName: 'TEXTAREA' };

	it('change setelah Enter yang meng-commit nilai fill tidak menjadi fill ganda; goto dari target_url', () => {
		const { events, add } = make();
		add({ action: 'click', locators: ["getByPlaceholder('Tulis pesan')"], element: textarea });
		add({ action: 'input', locators: ["getByPlaceholder('Tulis pesan')"], element: textarea, value: 'HL' });
		add({ action: 'input', locators: ["getByPlaceholder('Tulis pesan')"], element: textarea, value: 'HALO KAK' });
		add({ action: 'keydown', locators: ["getByPlaceholder('Tulis pesan')"], element: textarea, key: 'Enter' });
		add({ action: 'change', locators: ["getByPlaceholder('Tulis pesan')"], element: textarea, value: 'HALO KAK' });
		const { steps } = generatePlaywrightScript({ session: chatSession, events, checkpoints: [] });
		expect(steps.map((s) => `${s.action} ${s.value ?? ''}`.trim())).toEqual([
			'goto https://chat.knitto.org/chat',
			'click',
			'fill HALO KAK',
			'press Enter'
		]);
	});

	it('URL halaman aksi pertama diutamakan; target_url API tidak dipakai sebagai goto', () => {
		const withPage = make();
		withPage.add({ action: 'click', pageUrl: 'https://chat.knitto.org/chat?room=1', locators: ["getByRole('button', { name: 'Kirim' })"] });
		expect(generatePlaywrightScript({ session: chatSession, events: withPage.events, checkpoints: [] }).steps[0].value).toBe(
			'https://chat.knitto.org/chat?room=1'
		);

		const apiOnly = make();
		apiOnly.add({ action: 'click', locators: ["getByRole('button', { name: 'Kirim' })"] });
		const { script, steps } = generatePlaywrightScript({
			session: { ...chatSession, target_url: 'https://api-multichannel.knitto.org' },
			events: apiOnly.events,
			checkpoints: []
		});
		expect(steps[0].action).toBe('click');
		expect(script).toContain('// ⚠ URL awal tidak terekam');
		expect(script).not.toContain('page.goto(');
	});
});

describe('playwright-codegen aksi lanjutan', () => {
	const session = { test_case_no: 'TC-ADV', title: 'Aksi lanjutan', target_url: 'https://app.example.test/' };

	it('hover, dblclick (gabung klik pertama), klik kanan, drag, upload, dan iframe', () => {
		const { events, add } = make();
		add({ action: 'navigation', url: 'https://app.example.test/' });
		add({ action: 'hover', unique_locator: "getByRole('button', { name: 'Laporan', exact: true })" });
		add({ action: 'click', unique_locator: "getByRole('link', { name: 'Penjualan', exact: true })" });
		add({ action: 'click', unique_locator: "getByText('Baris 1', { exact: true })" });
		add({ action: 'dblclick', unique_locator: "getByText('Baris 1', { exact: true })" }, 200);
		add({ action: 'rightclick', unique_locator: "getByRole('row', { name: 'Baris 2', exact: true })" });
		add({ action: 'drag', unique_locator: "getByTestId('card-1')", target_unique_locator: "getByTestId('kolom-selesai')" });
		add({ action: 'upload', unique_locator: "getByLabel('Lampiran', { exact: true })", files: ['invoice 1.pdf'] });
		add({
			action: 'click',
			unique_locator: "getByRole('button', { name: 'Kirim', exact: true })",
			frame_locators: ["getByTitle('Live Chat', { exact: true })"]
		});

		const { script, steps } = generatePlaywrightScript({ session, events, checkpoints: [] });
		expect(steps.map((s) => s.action)).toEqual(['goto', 'hover', 'click', 'dblclick', 'rightclick', 'dragTo', 'setInputFiles', 'click']);
		expect(script).toContain("\tawait page.getByRole('button', { name: 'Laporan', exact: true }).hover();");
		expect(script).toContain("\tawait page.getByText('Baris 1', { exact: true }).dblclick();");
		expect(script).toContain("\tawait page.getByRole('row', { name: 'Baris 2', exact: true }).click({ button: 'right' });");
		expect(script).toContain("\tawait page.getByTestId('card-1').dragTo(page.getByTestId('kolom-selesai'));");
		expect(script).toContain("\tawait page.getByLabel('Lampiran', { exact: true }).setInputFiles(['fixtures/invoice 1.pdf']);");
		expect(script).toContain("\t// sediakan file uji di fixtures/: invoice 1.pdf");
		expect(script).toContain("\tawait page.getByTitle('Live Chat', { exact: true }).contentFrame().getByRole('button', { name: 'Kirim', exact: true }).click();");
	});

	it('dblclick tanpa klik sebelumnya tetap satu langkah dblclick', () => {
		const { events, add } = make();
		add({ action: 'navigation', url: 'https://app.example.test/' });
		add({ action: 'dblclick', unique_locator: "getByText('Sel A1', { exact: true })" });
		expect(generatePlaywrightScript({ session, events, checkpoints: [] }).steps.map((s) => s.action)).toEqual(['goto', 'dblclick']);
	});
});
