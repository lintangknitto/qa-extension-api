import { isSafeLocator } from '../../domain/locator-safety';
import { primaryLocator } from '../../domain/step-event';
import { generatePlaywrightScript } from '../../domain/playwright-codegen';
import { urlRegexLiteral } from '../../domain/url-pattern';

describe('isSafeLocator', () => {
	it.each([
		"getByRole('button', { name: 'Kirim', exact: true })",
		"page.getByLabel('Password')",
		"getByTestId(\"card-1\")",
		"locator('#form').getByText('Simpan').first()",
		"frameLocator('iframe').locator('div.row').nth(2)",
		"getByRole('heading', { level: 2 })",
		"getByText('it\\'s ok; = + `x`')"
	])('menerima %s', (locator) => {
		expect(isSafeLocator(locator)).toBe(true);
	});

	it.each([
		"locator('x'); require('child_process').execSync('calc'); //",
		"getByText('a') + process.exit(1)",
		"getByText(`${process.env.X}`)",
		"getByText('a\nb')",
		"getByText('a\u2028b')",
		"evaluate(() => fetch('https://evil'))",
		"getByText('a', { name: process.env.SECRET })",
		"getByText('a', { name: 'x'.constructor })",
		"getByText('a'",
		"getByText('a'))",
		"getByText('a').locator",
		"getByText(/abc/)",
		''
	])('menolak %s', (locator) => {
		expect(isSafeLocator(locator)).toBe(false);
	});
});

describe('codegen & url-pattern menolak injeksi dari checkpoint', () => {
	const session = { test_case_no: 'TC1-1', title: 'x', target_url: 'https://app.test/' };

	it('urlRegexLiteral: URL tidak valid berisi line terminator tetap satu literal regex', () => {
		for (const url of ["x\nawait page.evaluate(()=>1)\n//", 'x\u2028await y()', 'x\r\u2029z']) {
			const literal = urlRegexLiteral(url);
			expect(literal).not.toMatch(/[\r\n\u2028\u2029]/);
			// eslint-disable-next-line no-new-func
			expect(new Function(`return ${literal};`)()).toBeInstanceOf(RegExp);
		}
	});

	it('locator checkpoint berbahaya dilewati, locator aman berikutnya dipakai', () => {
		const { script } = generatePlaywrightScript({
			session,
			events: [],
			checkpoints: [
				{
					sequence: null,
					note: 'cek',
					target_locators: ["locator('x'); require('child_process').execSync('calc'); //", "getByRole('status')"],
					page_url: "x\nawait page.evaluate(()=>1)\n//"
				}
			]
		});
		expect(script).not.toContain('child_process');
		expect(script).toContain("await expect(page.getByRole('status')).toBeVisible();");
		expect(script).not.toMatch(/^\s*await page\.evaluate/m);
	});

	it('jalur event: locator/frame/target berbahaya dari payload tidak menjadi kode', () => {
		const evil = "locator('a').click(); require('child_process').execSync('calc'); //";
		const at = (i: number) => new Date(Date.parse('2026-10-08T03:00:00.000Z') + i * 3000).toISOString();
		const events = [
			{ action: 'navigation', url: 'https://app.test/' },
			// unique_locator berbahaya → kandidat aman berikutnya dipakai.
			{ action: 'click', unique_locator: evil, locators: [evil, "getByRole('button', { name: 'Simpan' })"], element: { tagName: 'BUTTON' } },
			// Semua kandidat berbahaya → fallback selector legacy yang di-quote.
			{ action: 'click', unique_locator: evil, selector: '#ok', element: { tagName: 'BUTTON' } },
			// Rantai iframe berbahaya → langkah tidak memakai locator mentah.
			{ action: 'click', unique_locator: "getByText('Isi')", frame_locators: [evil], element: { tagName: 'DIV' } },
			{ action: 'drag', unique_locator: "getByText('Kartu')", target_unique_locator: evil, target_locators: [evil], element: { tagName: 'DIV' } }
		].map((payload, i) => ({ type: 'action', sequence: i + 1, occurredAt: at(i), url: null, payload }));
		const { script } = generatePlaywrightScript({ session, events, checkpoints: [] });
		expect(script).not.toContain('child_process');
		expect(script).toContain("await page.getByRole('button', { name: 'Simpan' }).click();");
		expect(script).toContain("await page.locator('#ok').click();");
	});

	it('primaryLocator (share/konteks AI) membuang locator & frame berbahaya', () => {
		const evil = "locator('a'); process.exit(1)";
		expect(primaryLocator({ unique_locator: evil, locators: ["getByText('A')"] })).toBe("getByText('A')");
		expect(primaryLocator({ unique_locator: "getByText('A')", frame_locators: [evil] })).toBe('');
		expect(primaryLocator({ unique_locator: evil })).toBe('');
	});
});
