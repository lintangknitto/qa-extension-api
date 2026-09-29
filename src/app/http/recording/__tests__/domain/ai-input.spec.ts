import { buildAiSessionContext, collectAnomalies, parseStoredEvent, summarizeEventCounts } from '../../domain/ai-input';

const events = [
	{ type: 'action', sequence: 1, payload: { action: 'click', selector: '#login' } },
	{ type: 'console', sequence: 2, payload: { level: 'error', text: 'boom' } },
	{ type: 'console', sequence: 3, payload: { level: 'log', text: 'biasa' } },
	{ type: 'network', sequence: 4, url: 'https://a.test/x', payload: { method: 'GET', status: 500 } },
	{ type: 'network', sequence: 5, url: 'https://a.test/y', payload: { method: 'GET', status: 200 } },
	{ type: 'artifact', sequence: 6, payload: {} }
];

describe('ai-input', () => {
	describe('collectAnomalies', () => {
		it('mengumpulkan console error/warning dan network gagal', () => {
			const result = collectAnomalies(events);
			expect(result.consoleAnomalies).toHaveLength(1);
			expect(result.consoleAnomalies[0]).toContain('boom');
			expect(result.networkAnomalies).toHaveLength(1);
			expect(result.networkAnomalies[0]).toContain('500');
		});
	});

	describe('summarizeEventCounts', () => {
		it('menghitung jumlah per tipe', () => {
			expect(summarizeEventCounts(events)).toEqual({
				total: 6,
				actions: 1,
				console: 2,
				network: 2,
				artifacts: 1
			});
		});
	});

	describe('buildAiSessionContext', () => {
		it('menyusun seluruh section konteks', () => {
			const context = buildAiSessionContext({
				session: { test_case_no: 'TC-1', title: 'Login', result: 'FAIL' },
				events,
				checkpoints: [{ sequence: 2, note: 'cek error' }]
			});

			expect(context).toContain('## Identitas Test Case');
			expect(context).toContain('TC-1');
			expect(context).toContain('## Langkah Tester');
			expect(context).toContain('## Checkpoint Tester');
			expect(context).toContain('cek error');
			expect(context).toContain('## Anomali Network');
		});

		it('tetap menghasilkan konteks walau tidak ada checkpoint', () => {
			const context = buildAiSessionContext({ session: {}, events: [], checkpoints: [] });
			expect(context).toContain('(tidak ada checkpoint)');
		});

		it('merender langkah secara kaya lengkap dengan locator candidates, input value, dan key', () => {
			const richEvents = [
				{
					type: 'navigation',
					sequence: 1,
					payload: { url: 'https://chat.knitto.org/chat' }
				},
				{
					type: 'action',
					sequence: 2,
					payload: {
						action: 'click',
						locators: ["getByRole('button', { name: 'Kirim' })", "locator('#btn-send')"],
						element: { tagName: 'BUTTON', role: 'button', text: 'Kirim', testId: 'send-btn' }
					}
				},
				{
					type: 'action',
					sequence: 3,
					payload: {
						action: 'input',
						locators: ["getByPlaceholder('Ketik pesan...')"],
						element: { tagName: 'TEXTAREA', placeholder: 'Ketik pesan...' },
						value: 'Pesan uji otomatis'
					}
				},
				{
					type: 'action',
					sequence: 4,
					payload: {
						action: 'keydown',
						locators: ["getByPlaceholder('Ketik pesan...')"],
						key: 'Enter'
					}
				}
			];

			const context = buildAiSessionContext({
				session: { test_case_no: 'TC-CHAT-1', title: 'Kirim Pesan' },
				events: richEvents,
				checkpoints: []
			});

			expect(context).toContain('1. [NAVIGATE] Buka URL: https://chat.knitto.org/chat');
			expect(context).toContain("Primary Locator: page.getByRole('button', { name: 'Kirim' })");
			expect(context).toContain('Alternatif: [page.locator(\'#btn-send\')]');
			expect(context).toContain('data-testid="send-btn"');
			expect(context).toContain('Input Value: "Pesan uji otomatis"');
			expect(context).toContain('Tekan Tombol: "Enter"');
		});
	});

	describe('parseStoredEvent', () => {
		it('mengubah payload JSON string menjadi object', () => {
			const result = parseStoredEvent({ event_type: 'action', sequence: 1, payload: '{"a":1}' });
			expect(result.payload).toEqual({ a: 1 });
		});

		it('mengembalikan object kosong untuk payload rusak', () => {
			expect(parseStoredEvent({ event_type: 'action', sequence: 1, payload: 'bukan-json' }).payload).toEqual({});
			expect(parseStoredEvent({ event_type: 'action', sequence: 1, payload: null }).payload).toEqual({});
		});
	});
});
