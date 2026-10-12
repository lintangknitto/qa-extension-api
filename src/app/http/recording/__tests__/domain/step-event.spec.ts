import { describeCheckpointTarget, summarizeStepEvent } from '../../domain/step-event';

describe('summarizeStepEvent', () => {
	it('scroll halaman, container (dengan iframe), navigasi per jenis, tombol shortcut, tab baru', () => {
		expect(summarizeStepEvent('action', { action: 'scroll', element: null, scroll_x: 0, scroll_y: 900, delta_x: 0, delta_y: 600 })).toEqual({
			kind: 'scroll',
			label: 'Scroll halaman ke (0, 900), Δ (0, 600)'
		});
		expect(
			summarizeStepEvent('action', {
				action: 'scroll',
				unique_locator: "getByTestId('pesan')",
				frame_locators: ["page.getByTitle('Chat')"],
				scroll_y: 120,
				delta_y: 120
			})?.label
		).toBe("Scroll container getByTitle('Chat').contentFrame().getByTestId('pesan') ke (0, 120), Δ (0, 120)");
		expect(summarizeStepEvent('action', { action: 'navigation', url: 'https://a.test/x', navigation_type: 'reload' })?.label).toBe('Navigasi (muat ulang) ke https://a.test/x');
		expect(summarizeStepEvent('action', { action: 'navigation', url: 'https://a.test/x', navigation_type: 'back_forward', direction: 'back' })?.label).toBe('Navigasi (kembali) ke https://a.test/x');
		expect(summarizeStepEvent('action', { action: 'navigation', url: 'https://a.test/c/1', navigation_type: 'same_document' })?.label).toBe('Navigasi (SPA) ke https://a.test/c/1');
		expect(summarizeStepEvent('action', { action: 'navigation' }, 'https://a.test/lama')?.label).toBe('Navigasi ke https://a.test/lama');
		expect(summarizeStepEvent('action', { action: 'keydown', key: 'Enter', modifiers: ['Control'], unique_locator: "getByPlaceholder('Pesan')" })).toEqual({
			kind: 'keyboard',
			label: "Tombol Control+Enter pada getByPlaceholder('Pesan')"
		});
		expect(summarizeStepEvent('tab', { kind: 'opened', tab_id: 2, opener_tab_id: 1, url: 'https://a.test/inv' })?.label).toBe('Tab baru dibuka dari aksi: https://a.test/inv');
		expect(summarizeStepEvent('action', { action: 'click' })).toBeNull();
		expect(summarizeStepEvent('tab', { kind: 'switch' })).toBeNull();
	});
});

describe('describeCheckpointTarget', () => {
	it('elemen berteks, elemen tanpa teks, URL saja, tanpa target', () => {
		expect(describeCheckpointTarget({ target_locators: ["page.getByRole('status')"], target_text: ' Data  tersimpan ', page_url: 'https://a.test/x' })).toBe(
			`elemen getByRole('status') berisi "Data tersimpan"; URL https://a.test/x`
		);
		expect(describeCheckpointTarget({ target_locators: '["getByTestId(\'ok\')"]' })).toBe("elemen getByTestId('ok') terlihat");
		expect(describeCheckpointTarget({ page_url: 'https://a.test/y' })).toBe('URL https://a.test/y');
		expect(describeCheckpointTarget({})).toBeNull();
	});
});
