import type { IAiInputEvent } from '../../domain/ai-input';
import {
	collectFailureSignals,
	lastActionsBefore,
	prioritizeSignals,
	programsForSignal,
	searchTermsFor,
	shouldAutoInvestigate,
	surroundingLines,
	timeWindowFor
} from '../../domain/investigation-context';

const at = '2026-10-08T03:00:00.000Z';
const ev = (type: string, sequence: number, payload: Record<string, unknown>, url: string | null = null): IAiInputEvent => ({
	type,
	sequence,
	occurredAt: at,
	url,
	payload
});

const events: IAiInputEvent[] = [
	ev('action', 1, { action: 'input', unique_locator: "getByLabel('Pesan', { exact: true })", value: 'Halo' }),
	ev('action', 2, { action: 'click', unique_locator: "getByRole('button', { name: 'Kirim', exact: true })" }),
	ev('network', 3, { method: 'POST', status: 500, request_id: 'req-123' }, 'https://api-multichannel.knitto.org/api/chat/send'),
	ev('network', 4, { method: 'GET', status: 200 }, 'https://api-multichannel.knitto.org/api/chat'),
	ev('network', 5, { method: 'GET', status: 404 }, 'https://api-multichannel.knitto.org/api/avatar/9'),
	ev('console', 6, { level: 'error', text: 'TypeError: x is undefined' }, 'https://chat.knitto.org/chat'),
	ev('console', 7, { level: 'log', text: 'biasa' }),
	ev('replay_failure', 8, { step_no: 3, error: 'Elemen tidak ditemukan', step_description: 'Klik Kirim' })
];

const programs = [
	{ code: 'knitto-widget-chat', base_url: 'https://chat.knitto.org', grafana_dashboard_url: 'http://g/d/a' },
	{ code: 'knitto-api-chat', base_url: 'https://api-multichannel.knitto.org', grafana_dashboard_url: 'http://g/d/a' },
	{ code: 'tanpa-dashboard', base_url: 'https://x.test', grafana_dashboard_url: null }
];

describe('investigation-context', () => {
	it('mengumpulkan request gagal, console error, dan replay gagal', () => {
		const signals = collectFailureSignals(events);
		expect(signals.map((s) => [s.kind, s.sequence])).toEqual([
			['network', 3],
			['network', 5],
			['console', 6],
			['replay', 8]
		]);
		expect(signals[0]).toMatchObject({ requestId: 'req-123', status: 500, method: 'POST' });
		expect(signals[3].summary).toContain('langkah 3 (Klik Kirim)');
	});

	it('memprioritaskan request dengan requestId, lalu 5xx, 4xx, replay, console', () => {
		const ordered = prioritizeSignals(collectFailureSignals(events));
		expect(ordered.map((s) => s.sequence)).toEqual([3, 5, 8, 6]);
	});

	it('kata kunci: requestId lebih dulu, lalu path endpoint', () => {
		const [withId, withoutId] = collectFailureSignals(events);
		expect(searchTermsFor(withId)).toEqual(['req-123']);
		expect(searchTermsFor(withoutId)).toEqual(['/api/avatar/9']);
	});

	it('memetakan request ke program se-host; fallback ke semua program berdashboard', () => {
		const [network, , consoleSignal] = collectFailureSignals(events);
		expect(programsForSignal(programs, network).map((p) => p.code)).toEqual(['knitto-api-chat']);
		expect(programsForSignal(programs, consoleSignal).map((p) => p.code)).toEqual(['knitto-widget-chat']);
		expect(programsForSignal(programs, { kind: 'replay', sequence: 1, occurredAtMs: null, summary: '' }).map((p) => p.code)).toEqual([
			'knitto-widget-chat',
			'knitto-api-chat'
		]);
	});

	it('pemicu otomatis: FAIL/BLOCKED atau ada sinyal', () => {
		expect(shouldAutoInvestigate('FAIL', [])).toBe(true);
		expect(shouldAutoInvestigate('PASS', [])).toBe(false);
		expect(shouldAutoInvestigate('PASS', collectFailureSignals(events))).toBe(true);
	});

	it('rentang waktu ±2 menit dari sinyal, atau rentang sesi', () => {
		const [signal] = collectFailureSignals(events);
		expect(timeWindowFor(signal, {})).toEqual({ fromMs: Date.parse(at) - 120000, toMs: Date.parse(at) + 120000 });
		expect(timeWindowFor(null, { started_at: at, ended_at: at })).toEqual({ fromMs: Date.parse(at) - 60000, toMs: Date.parse(at) + 60000 });
	});

	it('langkah tester terakhir sebelum sinyal', () => {
		expect(lastActionsBefore(events, 3)).toEqual([
			`#1 input getByLabel('Pesan', { exact: true }) "Halo"`,
			`#2 click getByRole('button', { name: 'Kirim', exact: true })`
		]);
	});

	it('surroundingLines memakai urutan nanodetik untuk log multiline', () => {
		const lines = ['{', '  requestId: "req-123"', '  error: "boom"', '}'].map((line, i) => ({
			timestamp: '2026-10-08T03:00:00.000Z',
			timestampNs: `179143281724743${i}000`,
			line
		}));
		const shuffled = [lines[2], lines[0], lines[3], lines[1]];
		expect(surroundingLines(shuffled, lines[1], 1).map((l) => l.line)).toEqual(['{', '  requestId: "req-123"', '  error: "boom"']);
	});
});
