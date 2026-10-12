import type { IAiInputEvent } from '../../domain/ai-input';
import { buildSummary, CODEGEN_VERSION, generatePlaywrightScript, quoteJs, singleLine } from '../../domain/playwright-codegen';

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
	// Ringkasan: 14 event aksi → 11 langkah.
	// Digabung/dilewati:
	// - input beruntun digabung ke satu fill: 1 event (#3)
	// - change duplikat (nilai sama dengan fill): 1 event (#10)
	// - click + change digabung ke check()/uncheck(): 1 event (#13)
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
		expect(script).toContain("\tawait page.getByLabel('Lampiran', { exact: true }).setInputFiles(['test-data/invoice 1.pdf']);");
		expect(script).toContain('\t// test-data/invoice 1.pdf: file tidak tersimpan saat rekam, sediakan manual');
		expect(script).toContain("\tawait page.getByTitle('Live Chat', { exact: true }).contentFrame().getByRole('button', { name: 'Kirim', exact: true }).click();");
	});

	it('setInputFiles memakai test-data/ dengan komentar sumber artifact file rekaman', () => {
		const { events, add } = make();
		add({ action: 'navigation', url: 'https://app.example.test/form' });
		add({ action: 'upload', unique_locator: "getByLabel('Lampiran', { exact: true })", files: ['invoice.pdf', 'besar.zip'] });

		const { script } = generatePlaywrightScript({
			session,
			events,
			checkpoints: [],
			testDataFiles: [{ file_name: 'invoice.pdf', id_artifact: 31 }]
		});
		expect(script).toContain("setInputFiles(['test-data/invoice.pdf', 'test-data/besar.zip']);");
		expect(script).toContain('\t// test-data/invoice.pdf: file rekaman (artifact #31, GET /sessions/:id/test-data-files)');
		expect(script).toContain('\t// test-data/besar.zip: file tidak tersimpan saat rekam, sediakan manual');
	});

	it('dblclick tanpa klik sebelumnya tetap satu langkah dblclick', () => {
		const { events, add } = make();
		add({ action: 'navigation', url: 'https://app.example.test/' });
		add({ action: 'dblclick', unique_locator: "getByText('Sel A1', { exact: true })" });
		expect(generatePlaywrightScript({ session, events, checkpoints: [] }).steps.map((s) => s.action)).toEqual(['goto', 'dblclick']);
	});
});

describe('playwright-codegen aksi tanpa locator', () => {
	const session = { test_case_no: 'TC-XY', title: 'Kanvas', target_url: 'https://app.example.test/' };
	const point = { client_x: 120, client_y: 45, viewport_w: 1280, viewport_h: 720 };

	it('klik/dblclick/klik kanan tanpa locator → klik koordinat + TODO; viewport di header', () => {
		const { events, add } = make();
		add({ action: 'navigation', url: 'https://app.example.test/' });
		add({ action: 'click', locators: [], element: el('CANVAS'), ...point });
		add({ action: 'click', locators: [], element: el('CANVAS'), client_x: 300, client_y: 200, viewport_w: 1280, viewport_h: 720 });
		add({ action: 'dblclick', locators: [], element: el('CANVAS'), client_x: 300, client_y: 200, viewport_w: 1280, viewport_h: 720 }, 200);
		add({ action: 'rightclick', locators: [], element: el('CANVAS'), ...point });
		const { script, steps } = generatePlaywrightScript({ session, events, checkpoints: [] });
		expect(steps.map((s) => s.action)).toEqual(['goto', 'mouseClick', 'mouseDblclick', 'mouseClick']);
		expect(script).toContain('\t// Viewport rekaman: 1280x720');
		expect(script).toContain('\tawait page.mouse.click(120, 45); // TODO: locator tidak stabil (canvas)');
		expect(script).toContain('\tawait page.mouse.dblclick(300, 200); // TODO: locator tidak stabil (canvas)');
		expect(script).toContain("\tawait page.mouse.click(120, 45, { button: 'right' }); // TODO: locator tidak stabil (canvas)");
	});

	it('aksi yang tidak bisa dipetakan ditulis sebagai komentar Dilewati, tidak hilang diam-diam', () => {
		const { events, add } = make();
		add({ action: 'navigation', url: 'https://app.example.test/' });
		add({ action: 'click', locators: [], element: el('DIV') });
		add({ action: 'click', locators: [], element: el('DIV'), frame_locators: ["getByTitle('Chat')"], ...point });
		add({ action: 'hover', locators: [], element: el('SPAN') });
		add({ action: 'pinch', locators: [] });
		add({ action: 'click', unique_locator: "getByRole('button', { name: 'Simpan', exact: true })", element: el('BUTTON') });
		add({ action: 'drag', unique_locator: "getByTestId('a')" });
		const { script, steps } = generatePlaywrightScript({ session, events, checkpoints: [] });
		expect(steps.map((s) => s.action)).toEqual(['goto', 'click']);
		expect(script).toContain('\t// Dilewati: click tanpa locator dan tanpa koordinat (rekaman lama) (event #2)');
		expect(script).toContain('\t// Dilewati: click tanpa locator di dalam iframe (event #3)');
		expect(script).toContain('\t// Dilewati: hover tanpa locator (event #4)');
		expect(script).toContain('\t// Dilewati: aksi "pinch" belum didukung codegen (event #5)');
		expect(script).toContain('\t// Dilewati: drag tanpa locator tujuan (event #7)');
		// Komentar berada sebelum langkah berikutnya.
		expect(script.indexOf('(event #5)')).toBeLessThan(script.indexOf("name: 'Simpan'"));
		// Setiap event aksi tercatat: jadi langkah atau komentar.
		const commented = [...script.matchAll(/\(event #(\d+)\)/g)].map((m) => Number(m[1]));
		expect([...steps.flatMap((s) => s.sequences), ...commented].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});
});

describe('playwright-codegen keyboard', () => {
	const session = { test_case_no: 'TC-KEY', title: 'Shortcut', target_url: 'https://app.example.test/' };

	it('kombinasi modifier format Playwright; tanpa target → page.keyboard.press; scroll akibat tombol dilewati', () => {
		const { events, add } = make();
		const textarea = "getByPlaceholder('Pesan', { exact: true })";
		add({ action: 'navigation', url: 'https://app.example.test/' });
		add({ action: 'keydown', unique_locator: textarea, element: el('TEXTAREA'), key: 'Enter', modifiers: ['Shift', 'Control'] });
		add({ action: 'keydown', unique_locator: textarea, element: el('TEXTAREA'), key: 'ArrowDown', modifiers: [] });
		add({ action: 'keydown', element: null, key: 'PageDown', modifiers: [] });
		add({ action: 'scroll', element: null, scroll_x: 0, scroll_y: 700, delta_x: 0, delta_y: 700 }, 400);
		add({ action: 'keydown', element: null, key: 'k', modifiers: ['Meta'] });
		const { script, steps } = generatePlaywrightScript({ session, events, checkpoints: [] });
		expect(steps.map((s) => s.action)).toEqual(['goto', 'press', 'press', 'keyboardPress', 'keyboardPress']);
		expect(script).toContain("\tawait page.getByPlaceholder('Pesan', { exact: true }).press('Control+Shift+Enter');");
		expect(script).toContain("\tawait page.getByPlaceholder('Pesan', { exact: true }).press('ArrowDown');");
		expect(script).toContain("\tawait page.keyboard.press('PageDown');");
		expect(script).toContain("\tawait page.keyboard.press('Meta+k');");
		expect(script).not.toContain('mouse.wheel');
	});
});

describe('playwright-codegen jenis navigasi', () => {
	const session = { test_case_no: 'TC-NAV', title: 'Navigasi', target_url: 'https://chat.test/' };
	const nav = (url: string, navigation_type: string, extra: Record<string, unknown> = {}) => ({ action: 'navigation', url, navigation_type, ...extra });

	it('reload, typed, link SPA ber-ID dinamis, back, dan forward', () => {
		const { events, add } = make();
		add(nav('https://chat.test/inbox', 'typed'));
		add(nav('https://chat.test/inbox', 'reload'));
		add(nav('https://chat.test/laporan?bulan=10', 'typed'));
		add({ action: 'click', unique_locator: "getByText('Budi', { exact: true })", element: el('LI') });
		add(nav('https://chat.test/chat/48213', 'same_document', { same_document: true }), 200);
		add(nav('https://chat.test/laporan?bulan=10', 'back_forward', { direction: 'back' }));
		add(nav('https://chat.test/chat/48213', 'back_forward', { direction: 'forward' }));
		const { script, steps } = generatePlaywrightScript({ session, events, checkpoints: [] });
		expect(steps.map((s) => s.action)).toEqual(['goto', 'reload', 'goto', 'click', 'waitForURL', 'goBack', 'goForward']);
		expect(script).toContain("\tawait page.goto('https://chat.test/inbox');\n\tawait page.reload();\n\tawait page.goto('https://chat.test/laporan?bulan=10');");
		expect(script).toContain("\tawait page.waitForURL('**/chat/*');");
		expect(script).toContain('\tawait page.goBack();\n\tawait page.goForward();');
		expect(script).toContain('\tawait expect(page).toHaveURL(/^[a-z][\\w+.-]*:\\/\\/[^/]+\\/chat\\/[^/]+(?:[?#].*)?$/);');
	});

	it('link lambat tetap waitForURL; redirect beruntun digabung ke pola URL akhir; reload tidak digabung', () => {
		const { events, add } = make();
		add(nav('https://a.test/', 'typed'));
		add({ action: 'click', unique_locator: "getByRole('link', { name: 'Masuk', exact: true })", element: el('A') });
		add(nav('https://a.test/sso', 'link'), 300);
		add(nav('https://a.test/home', 'other'), 500);
		add(nav('https://a.test/tiket/77001', 'link'), 9000);
		add(nav('https://a.test/tiket/77001', 'reload'));
		const { steps } = generatePlaywrightScript({ session, events, checkpoints: [] });
		expect(steps.map((s) => [s.action, s.value ?? ''])).toEqual([
			['goto', 'https://a.test/'],
			['click', ''],
			['waitForURL', '**/home'],
			['waitForURL', '**/tiket/*'],
			['reload', '']
		]);
	});
});

describe('playwright-codegen multi-tab', () => {
	const session = { test_case_no: 'TC-TAB', title: 'Multi tab', target_url: 'https://app.example.test/' };
	const at = (events: IAiInputEvent[], tabId: number) => (events[events.length - 1].tabId = tabId);
	const tabEvent = (events: IAiInputEvent[], payload: Record<string, unknown>, gapMs = 300) => {
		const last = events[events.length - 1];
		events.push({ type: 'tab', sequence: last.sequence + 1, occurredAt: new Date(Date.parse(last.occurredAt!) + gapMs).toISOString(), url: null, tabId: (payload.tab_id ?? payload.to_tab_id) as number, payload });
	};

	it('tab dari klik → Promise.all popup; langkah di variabel page tab-nya; pindah tab → bringToFront', () => {
		const { events, add } = make();
		add({ action: 'navigation', url: 'https://app.example.test/order/1001', navigation_type: 'typed' });
		at(events, 11);
		add({ action: 'click', unique_locator: "getByRole('link', { name: 'Invoice', exact: true })", element: el('A') });
		at(events, 11);
		tabEvent(events, { kind: 'opened', tab_id: 22, opener_tab_id: 11, url: 'https://app.example.test/invoice/9001' });
		tabEvent(events, { kind: 'switch', from_tab_id: 11, to_tab_id: 22 }, 10);
		const nav = { type: 'action', sequence: 5, occurredAt: new Date(Date.parse(events[3].occurredAt!) + 200).toISOString(), url: null, tabId: 22, payload: { action: 'navigation', url: 'https://app.example.test/invoice/9001', navigation_type: 'link' } };
		events.push(nav);
		events.push({ ...nav, sequence: 6, payload: { action: 'click', unique_locator: "getByRole('button', { name: 'Cetak', exact: true })" } });
		tabEvent(events, { kind: 'switch', from_tab_id: 22, to_tab_id: 11 }, 2000);
		events.push({ ...nav, sequence: 8, occurredAt: new Date(Date.parse(nav.occurredAt) + 5000).toISOString(), tabId: 11, payload: { action: 'click', unique_locator: "getByRole('button', { name: 'Selesai', exact: true })" } });

		const { script } = generatePlaywrightScript({ session, events, checkpoints: [] });
		expect(script).toContain("test('TC-TAB Multi tab', async ({ page, context }) => {");
		expect(script).toContain(
			"\tconst [page2] = await Promise.all([page.waitForEvent('popup'), page.getByRole('link', { name: 'Invoice', exact: true }).click()]);\n" +
				"\tawait page2.waitForURL('**/invoice/*');\n" +
				"\tawait page2.getByRole('button', { name: 'Cetak', exact: true }).click();\n" +
				'\tawait page.bringToFront();\n' +
				"\tawait page.getByRole('button', { name: 'Selesai', exact: true }).click();"
		);
	});

	it('tab tanpa pemicu → context.newPage() + goto; navigasi ke URL yang sama digabung', () => {
		const { events, add } = make();
		add({ action: 'navigation', url: 'https://app.example.test/', navigation_type: 'typed' });
		at(events, 1);
		tabEvent(events, { kind: 'opened', tab_id: 2, opener_tab_id: null, url: 'https://docs.example.test/' }, 10000);
		events.push({ type: 'action', sequence: 3, occurredAt: events[1].occurredAt, url: null, tabId: 2, payload: { action: 'navigation', url: 'https://docs.example.test/', navigation_type: 'typed' } });
		events.push({ type: 'action', sequence: 4, occurredAt: events[1].occurredAt, url: null, tabId: 2, payload: { action: 'click', unique_locator: "getByText('API', { exact: true })" } });
		const { script, steps } = generatePlaywrightScript({ session, events, checkpoints: [] });
		expect(steps.map((s) => [s.action, s.pageVar])).toEqual([['goto', 'page'], ['newPage', 'page2'], ['click', 'page2']]);
		expect(script).toContain("\tconst page2 = await context.newPage();\n\tawait page2.goto('https://docs.example.test/');\n\tawait page2.getByText('API', { exact: true }).click();");
	});

	it('rekaman tanpa tab_id tetap satu page dengan fixture { page }', () => {
		const { events, add } = make();
		add({ action: 'navigation', url: 'https://app.example.test/' });
		add({ action: 'click', unique_locator: "getByText('A', { exact: true })" });
		expect(generatePlaywrightScript({ session, events, checkpoints: [] }).script).toContain('async ({ page }) => {');
	});
});

describe('playwright-codegen assertion checkpoint', () => {
	const session = { test_case_no: 'TC-CP', title: 'Checkpoint', target_url: 'https://app.example.test/' };

	it('elemen ber-teks → toContainText, tanpa teks → toBeVisible, URL → toHaveURL pola; catatan jadi komentar di atasnya', () => {
		const { events, add } = make();
		add({ action: 'navigation', url: 'https://app.example.test/chat/48213', navigation_type: 'typed' });
		add({ action: 'click', unique_locator: "getByRole('button', { name: 'Kirim', exact: true })", element: el('BUTTON') });
		add({ action: 'click', unique_locator: "getByRole('button', { name: 'Tutup', exact: true })", element: el('BUTTON') });
		const { script } = generatePlaywrightScript({
			session,
			events,
			checkpoints: [
				{ sequence: 2, note: 'Pesan  terkirim', target_locators: ["page.getByRole('status')", "getByText('Terkirim')"], target_text: "Pesan 'terkirim'", page_url: 'https://app.example.test/chat/48213?token=x' },
				{ sequence: 2, note: 'Ikon centang tampil', target_locators: '["getByTestId(\'centang\')"]', target_text: '' },
				{ sequence: 3, note: 'Halaman tetap', page_url: 'https://app.example.test/chat/48213' }
			]
		});
		expect(script).toContain(
			"\tawait page.getByRole('button', { name: 'Kirim', exact: true }).click();\n" +
				'\t// checkpoint: Pesan terkirim\n' +
				'\t// checkpoint: Ikon centang tampil\n' +
				"\tawait expect(page.getByRole('status')).toContainText('Pesan \\'terkirim\\'');\n" +
				'\tawait expect(page).toHaveURL(/^[a-z][\\w+.-]*:\\/\\/[^/]+\\/chat\\/[^/]+(?:[?#].*)?$/);\n' +
				"\tawait expect(page.getByTestId('centang')).toBeVisible();\n" +
				"\tawait page.getByRole('button', { name: 'Tutup', exact: true }).click();\n" +
				'\t// checkpoint: Halaman tetap\n' +
				'\tawait expect(page).toHaveURL(/^[a-z][\\w+.-]*:\\/\\/[^/]+\\/chat\\/[^/]+(?:[?#].*)?$/);'
		);
	});

	it('checkpoint di tab kedua memakai variabel page tab itu; tanpa sequence → setelah langkah terakhir', () => {
		const { events, add } = make();
		add({ action: 'navigation', url: 'https://app.example.test/', navigation_type: 'typed' });
		events[0].tabId = 1;
		events.push({ type: 'tab', sequence: 2, occurredAt: new Date(T0 + 99999).toISOString(), url: null, tabId: 2, payload: { kind: 'opened', tab_id: 2, opener_tab_id: null, url: 'https://docs.example.test/' } });
		const { script } = generatePlaywrightScript({
			session,
			events,
			checkpoints: [{ sequence: null, note: 'Docs tampil', target_locators: ["getByRole('heading')"], target_text: 'API', tab_id: 2 }]
		});
		expect(script).toContain("\tawait expect(page2.getByRole('heading')).toContainText('API');");
		expect(script.indexOf('page2.getByRole')).toBeGreaterThan(script.indexOf('context.newPage()'));
	});

	it('checkpoint sebelum aksi pertama ditaruh setelah goto awal (prependStartUrl)', () => {
		const { events, add } = make();
		add({ action: 'click', pageUrl: 'https://app.example.test/home', unique_locator: "getByText('A', { exact: true })" });
		const { script } = generatePlaywrightScript({ session, events, checkpoints: [{ sequence: 0, note: 'Beranda', page_url: 'https://app.example.test/home' }] });
		expect(script).toContain("\tawait page.goto('https://app.example.test/home');\n\t// checkpoint: Beranda\n\tawait expect(page).toHaveURL(");
	});
});

describe('playwright-codegen ringkasan header', () => {
	const session = { test_case_no: 'TC-SUM', title: 'Ringkasan', target_url: 'https://app.example.test/' };

	it('mencantumkan scroll yang diwakili auto-scroll, widget internal, dan langkah dilewati; byte-identik', () => {
		const build = () => {
			const { events, add } = make();
			add({ action: 'navigation', url: 'https://app.example.test/', navigation_type: 'typed' });
			add({ action: 'scroll', element: null, scroll_x: 0, scroll_y: 300, delta_x: 0, delta_y: 300 });
			add({ action: 'click', unique_locator: "getByText('A', { exact: true })", element: el('P') }, 500);
			add({ action: 'click', locators: ["locator('#qa-knitto-fab-host')"], element: el('DIV', { id: 'qa-knitto-fab-host' }) });
			add({ action: 'hover', locators: [], element: el('SPAN') });
			return generatePlaywrightScript({ session, events, checkpoints: [] });
		};
		const { script, notes } = build();
		expect(script).toContain(
			'\t// Ringkasan: 4 event aksi → 2 langkah.\n' +
				'\t// Digabung/dilewati:\n' +
				'\t// - scroll diwakili auto-scroll Playwright: 1 event (#2)\n' +
				'\t// - dilewati: hover tanpa locator: 1 event (#5)\n' +
				'\t// - klik pada widget QA diabaikan: 1 event\n'
		);
		expect(notes.map((n) => n.reason)).toEqual(['scroll diwakili auto-scroll Playwright', 'dilewati: hover tanpa locator']);
		expect(build().script).toBe(script);
	});

	it('nomor event dibatasi 10 per alasan; CODEGEN_VERSION naik', () => {
		expect(buildSummary(30, 5, [{ reason: 'input beruntun digabung ke satu fill', sequences: Array.from({ length: 12 }, (_, i) => 12 - i) }], 0)).toEqual([
			'Ringkasan: 30 event aksi → 5 langkah.',
			'Digabung/dilewati:',
			'- input beruntun digabung ke satu fill: 12 event (#1, #2, #3, #4, #5, #6, #7, #8, #9, #10, … +2)'
		]);
		expect(buildSummary(1, 1, [], 0)).toEqual(['Ringkasan: 1 event aksi → 1 langkah.']);
		expect(CODEGEN_VERSION).toBe('codegen-v2');
	});
});

describe('playwright-codegen scroll', () => {
	const session = { test_case_no: 'TC-SCROLL', title: 'Scroll', target_url: 'https://app.example.test/' };
	const list = { tagName: 'DIV', cssPath: 'div#chat-list' };
	const scroll = (extra: Record<string, unknown>) => ({ action: 'scroll', element: null, scroll_x: 0, scroll_y: 0, delta_x: 0, delta_y: 0, ...extra });

	it('scroll window beruntun digabung jadi satu mouse.wheel dengan total delta', () => {
		const { events, add } = make();
		add({ action: 'navigation', url: 'https://app.example.test/' });
		add(scroll({ scroll_y: 400, delta_y: 400 }));
		add(scroll({ scroll_y: 1000, delta_y: 600 }), 800);
		const { script, steps } = generatePlaywrightScript({ session, events, checkpoints: [] });
		expect(steps.map((s) => s.action)).toEqual(['goto', 'mouseWheel']);
		expect(script).toContain('\tawait page.mouse.wheel(0, 1000);');
		expect(steps[1].sequences).toEqual([2, 3]);
	});

	it('scroll window yang ≤ 2 detik diikuti klik dilewati (auto-scroll), yang lambat tetap ditulis', () => {
		const { events, add } = make();
		add({ action: 'navigation', url: 'https://app.example.test/' });
		add(scroll({ scroll_y: 500, delta_y: 500 }));
		add({ action: 'click', unique_locator: "getByRole('button', { name: 'Simpan', exact: true })", element: el('BUTTON') }, 1500);
		add(scroll({ scroll_y: 900, delta_y: 400 }));
		add({ action: 'click', unique_locator: "getByRole('button', { name: 'Muat', exact: true })", element: el('BUTTON') }, 5000);
		const { steps } = generatePlaywrightScript({ session, events, checkpoints: [] });
		expect(steps.map((s) => s.action)).toEqual(['goto', 'click', 'mouseWheel', 'click']);
	});

	it('scroll container → scrollTo posisi akhir; dilewati hanya bila aksi berikutnya di dalam container', () => {
		const { events, add } = make();
		add({ action: 'navigation', url: 'https://app.example.test/' });
		add(scroll({ unique_locator: "getByTestId('chat-list')", element: list, scroll_y: 300, delta_y: 300 }));
		add(scroll({ unique_locator: "getByTestId('chat-list')", element: list, scroll_y: 700, delta_y: 400 }), 500);
		// Di luar container: scroll tetap ditulis.
		add({ action: 'click', unique_locator: "getByRole('button', { name: 'Kirim', exact: true })", element: el('BUTTON', { cssPath: 'footer > button' }) }, 500);
		add(scroll({ unique_locator: "getByTestId('chat-list')", element: list, scroll_y: 900, delta_y: 200 }));
		// Di dalam container: dilewati.
		add({ action: 'click', unique_locator: "getByText('Pesan 40', { exact: true })", element: el('P', { cssPath: 'div#chat-list > p:nth-of-type(40)' }) }, 500);
		const { script, steps } = generatePlaywrightScript({ session, events, checkpoints: [] });
		expect(steps.map((s) => s.action)).toEqual(['goto', 'scrollTo', 'click', 'click']);
		expect(script).toContain("\tawait page.getByTestId('chat-list').evaluate((el) => el.scrollTo(0, 700));");
	});

	it('scroll di iframe memakai contentFrame(); scroll dokumen iframe memakai locator html', () => {
		const { events, add } = make();
		const frame_locators = ["getByTitle('Live Chat', { exact: true })"];
		add({ action: 'navigation', url: 'https://app.example.test/' });
		add(scroll({ unique_locator: "getByTestId('pesan')", element: { tagName: 'DIV' }, frame_locators, scroll_y: 120, delta_y: 120 }));
		add(scroll({ frame_locators, scroll_y: 50, delta_y: 50 }));
		const { script } = generatePlaywrightScript({ session, events, checkpoints: [] });
		expect(script).toContain("\tawait page.getByTitle('Live Chat', { exact: true }).contentFrame().getByTestId('pesan').evaluate((el) => el.scrollTo(0, 120));");
		expect(script).toContain("\tawait page.getByTitle('Live Chat', { exact: true }).contentFrame().locator('html').evaluate((el) => el.scrollTo(0, 50));");
	});

	it('komentar menetralkan \r, U+2028, U+2029 agar teks rekaman tidak menjadi kode', () => {
		const { events, add } = make();
		recordFlow(add);
		const note = 'a\rprocess.exit(1)\u2028b\u2029c';
		const { script } = generatePlaywrightScript({ session, events, checkpoints: [{ sequence: null, note }, { sequence: 1, note }] });
		expect(script).not.toMatch(/[\r\u2028\u2029]/);
		for (const line of script.split('\n').filter((l) => l.includes('process.exit'))) {
			expect(line.slice(0, line.indexOf('process.exit'))).toContain('//');
		}
	});

	it('singleLine menetralkan semua line terminator JS', () => {
		expect(singleLine('a\rb\r\nc\nd\u2028e\u2029f')).toBe('a b c d e f');
	});

	it('checkpoint dengan teks target teredaksi memakai toBeVisible()', () => {
		const { events, add } = make();
		recordFlow(add);
		const { script } = generatePlaywrightScript({
			session,
			events,
			checkpoints: [{ sequence: 14, note: 'cek', target_locators: JSON.stringify(["getByRole('status')"]), target_text: 'Halo [REDACTED]' }]
		});
		expect(script).toContain("await expect(page.getByRole('status')).toBeVisible();");
		expect(script).not.toContain('toContainText');
	});
});
