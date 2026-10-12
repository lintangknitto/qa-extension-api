import { safeParse } from 'valibot';
import request from '../../session.request';

const parse = (body: unknown) => safeParse(request.createCheckpointValidation, body);

describe('createCheckpointValidation (checkpoint ber-target)', () => {
	it('body lama (hanya note/sequence) tetap valid', () => {
		expect(parse({ note: 'cek', sequence: 3 }).success).toBe(true);
	});

	it('menerima target lengkap dan null', () => {
		expect(
			parse({
				note: 'toast',
				target_locators: ["getByRole('status')", "getByText('Tersimpan')"],
				target_text: 'Tersimpan',
				page_url: 'https://app.test/x',
				tab_id: 12
			}).success
		).toBe(true);
		expect(parse({ note: 'url saja', target_locators: null, target_text: null, page_url: 'https://app.test/x', tab_id: null }).success).toBe(true);
	});

	it('menolak teks > 200, locator kosong/terlalu banyak, dan tab_id bukan integer', () => {
		expect(parse({ note: 'a', target_text: 'x'.repeat(201) }).success).toBe(false);
		expect(parse({ note: 'a', target_locators: [''] }).success).toBe(false);
		expect(parse({ note: 'a', target_locators: Array.from({ length: 11 }, (_, i) => `getByText('${i}')`) }).success).toBe(false);
		expect(parse({ note: 'a', target_locators: 'getByText' }).success).toBe(false);
		expect(parse({ note: 'a', tab_id: 1.5 }).success).toBe(false);
	});
});
