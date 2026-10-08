jest.mock('@/app/http/recording/repo/generation.repo', () => ({
	startGeneration: jest.fn().mockResolvedValue(21),
	markGenerationCompleted: jest.fn(),
	markGenerationFailed: jest.fn()
}));
jest.mock('@/app/http/observability/use-case/correlate-session-logs.use-case', () => ({
	findMatchingCodeContext: jest.fn()
}));
jest.mock('@/app/http/program/queries/program.queries', () => ({ listProgramsForProject: jest.fn() }));
jest.mock('@knittotextile/knitto-core-backend', () => ({
	...jest.requireActual('@knittotextile/knitto-core-backend'),
	logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }
}));

import { logger } from '@knittotextile/knitto-core-backend';
import dashboard from '../../../observability/__tests__/fixtures/monitoring-logs-docker.dashboard.json';
import * as generationRepo from '@/app/http/recording/repo/generation.repo';
import type { IAiInputEvent } from '../../domain/ai-input';
import { persistInvestigation, runInvestigation, startInvestigationInBackground } from '../../use-case/investigate-session.use-case';

const DASHBOARD_URL =
	'http://grafana.test/d/5cb00b4e-0cd6-44a5-b6e0-361b31c966a5/monitoring-logs-docker?orgId=1&var-provider=GCP&var-environment=STAGING&var-cabang=GCP-SANDBOX&var-service=SERVICE_NAME&var-search_value=&var-search_value_2=&var-loki_ds=bff5y085q5d6oe';

const programs = [
	{ id_program: 1, code: 'knitto-widget-chat', base_url: 'https://chat.knitto.org', grafana_dashboard_url: DASHBOARD_URL.replace('SERVICE_NAME', 'knitto-widget-chat-staging') },
	{ id_program: 2, code: 'knitto-api-chat', base_url: 'https://api-multichannel.knitto.org', grafana_dashboard_url: DASHBOARD_URL.replace('SERVICE_NAME', 'knitto-api-chat-staging') }
];

const session = { id_session: 5, id_project: 1, test_case_no: 'TC-CHAT-1', title: 'Kirim pesan', result: 'FAIL', target_url: 'https://chat.knitto.org/chat' };

const hitTime = '2026-10-08T03:00:01.000Z';
const events: IAiInputEvent[] = [
	{ type: 'action', sequence: 1, occurredAt: '2026-10-08T03:00:00.000Z', url: null, payload: { action: 'click', unique_locator: "getByRole('button', { name: 'Kirim', exact: true })" } },
	{ type: 'network', sequence: 2, occurredAt: hitTime, url: 'https://api-multichannel.knitto.org/api/chat/send', payload: { method: 'POST', status: 500, request_id: 'req-9' } }
];

const makeDeps = () => {
	const queryLokiLogs = jest.fn(async (logql: string, _fromMs?: number, _toMs?: number, _limit?: number, _uid?: string) =>
		logql.includes('|= "req-9"')
			? [{ timestamp: hitTime, timestampNs: '1791432001000000002', line: '  requestId: "req-9"' }]
			: [
				{ timestamp: hitTime, timestampNs: '1791432001000000001', line: '[ERROR] gagal simpan pesan: duplicate key' },
				{ timestamp: hitTime, timestampNs: '1791432001000000002', line: '  requestId: "req-9"' },
				{ timestamp: hitTime, timestampNs: '1791432001000000003', line: '  status: 500' }
			]
	);
	return {
		grafana: { getDashboard: jest.fn().mockResolvedValue(dashboard), queryLokiLogs },
		completer: { complete: jest.fn().mockResolvedValue('## Ringkasan\nDuplikasi key saat simpan pesan.') },
		listPrograms: jest.fn().mockResolvedValue(programs),
		findCodeContext: jest.fn().mockResolvedValue([{ file_path: 'src/chat/send.ts', start_line: 10, end_line: 20, content: 'insert into messages' }])
	};
};

describe('investigate-session', () => {
	beforeEach(() => jest.clearAllMocks());

	it('query Loki memakai dashboard program se-host request, requestId sebagai kata kunci, dan baris sekitar hit', async () => {
		const deps = makeDeps();
		const output = await runInvestigation(session, events, deps);

		const [firstQuery, , , , datasource] = deps.grafana.queryLokiLogs.mock.calls[0];
		expect(firstQuery).toBe('{job="docker", cabang="GCP-SANDBOX", environment="STAGING", service_name="knitto-api-chat-staging"} |= "req-9"');
		expect(datasource).toBe('bff5y085q5d6oe');
		expect(deps.grafana.getDashboard).toHaveBeenCalledWith('5cb00b4e-0cd6-44a5-b6e0-361b31c966a5');

		const context = deps.completer.complete.mock.calls[0][0].user as string;
		expect(context).toContain('#2 POST 500 https://api-multichannel.knitto.org/api/chat/send (requestId req-9)');
		expect(context).toContain("langkah sebelumnya: #1 click getByRole('button', { name: 'Kirim', exact: true })");
		expect(context).toContain('[ERROR] gagal simpan pesan: duplicate key');
		expect(context).toContain('src/chat/send.ts:10-20');
		expect(deps.completer.complete.mock.calls[0][0].system).toContain('Dugaan Akar Masalah');

		expect(output).toContain('Duplikasi key saat simpan pesan.');
		expect(output).toContain('## Bukti & tautan dashboard');
		expect(output).toContain('var-search_value=req-9');
	});

	it('tanpa sinyal: hanya baris berlevel error di semua dashboard program selama rentang sesi', async () => {
		const deps = makeDeps();
		await runInvestigation({ ...session, started_at: hitTime, ended_at: hitTime }, [events[0]], deps);
		const hitQueries = deps.grafana.queryLokiLogs.mock.calls.map((call) => call[0]).filter((q) => q.includes('|~'));
		expect(hitQueries).toEqual([
			expect.stringContaining('service_name="knitto-widget-chat-staging"} |~ "(?i)(error|exception|fatal|panic)"'),
			expect.stringContaining('service_name="knitto-api-chat-staging"} |~ "(?i)(error|exception|fatal|panic)"')
		]);
		// Dashboard yang sama hanya diambil sekali.
		expect(deps.grafana.getDashboard).toHaveBeenCalledTimes(1);
	});

	it('console error tanpa kata kunci: tidak query tanpa filter, dan tidak disebut "baris cocok"', async () => {
		const deps = makeDeps();
		const consoleEvent: IAiInputEvent = {
			type: 'console', sequence: 3, occurredAt: hitTime, url: 'https://chat.knitto.org/chat', payload: { level: 'error', text: 'Failed to load resource' }
		};
		const output = await runInvestigation(session, [events[0], consoleEvent], deps);
		const hitQueries = deps.grafana.queryLokiLogs.mock.calls.map((call) => call[0]).filter((q) => !q.endsWith('}'));
		expect(hitQueries.length).toBeGreaterThan(0);
		// Setiap query hit wajib punya filter: tidak ada query tanpa |= / |~ selain query konteks sekitar hit.
		expect(hitQueries.every((q) => q.includes('|~ "(?i)(error|exception|fatal|panic)"'))).toBe(true);
		const context = deps.completer.complete.mock.calls[0][0].user as string;
		expect(context).toContain('baris error (tanpa kata kunci spesifik, belum tentu terkait)');
		expect(context).not.toContain('baris cocok');
		expect(output).toContain('(tidak terfilter kata kunci)');
	});

	it('cuplikan log tumpang tindih lintas sinyal tidak diulang di konteks AI', async () => {
		const deps = makeDeps();
		const second: IAiInputEvent = { ...events[1], sequence: 4, payload: { method: 'POST', status: 500 } };
		await runInvestigation(session, [...events, second], deps);
		const context = deps.completer.complete.mock.calls[0][0].user as string;
		expect(context.split('[ERROR] gagal simpan pesan: duplicate key')).toHaveLength(2);
	});

	it('baris log Loki & teks console diredaksi sebelum dikirim ke AI dan disimpan', async () => {
		const deps = makeDeps();
		deps.grafana.queryLokiLogs.mockResolvedValue([
			{ timestamp: hitTime, timestampNs: '1791432001000000001', line: 'requestId: "req-9" Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc password=Rahasia123 user=a.b@knitto.co.id' }
		]);
		const consoleEvent: IAiInputEvent = {
			type: 'console', sequence: 3, occurredAt: hitTime, url: 'https://chat.knitto.org/chat', payload: { level: 'error', text: 'login gagal token=sk-live-1234567890abcdef' }
		};
		const output = await runInvestigation(session, [...events, consoleEvent], deps);
		const context = deps.completer.complete.mock.calls[0][0].user as string;
		for (const secret of ['eyJhbGciOiJIUzI1NiJ9.abc', 'Rahasia123', 'a.b@knitto.co.id', 'sk-live-1234567890abcdef']) {
			expect(context).not.toContain(secret);
			expect(output).not.toContain(secret);
		}
		expect(context).toContain('Authorization: [REDACTED]');
		expect(context).toContain('password=[REDACTED]');
	});

	it('kegagalan Grafana tidak menggagalkan investigasi, dicatat di konteks & lampiran', async () => {
		const deps = makeDeps();
		deps.grafana.getDashboard.mockRejectedValue(new Error('HTTP 502'));
		const output = await runInvestigation(session, events, deps);
		expect(deps.completer.complete.mock.calls[0][0].user).toContain('gagal query log — HTTP 502');
		expect(output).toContain('gagal query: HTTP 502');
	});

	it('startInvestigationInBackground: tidak menahan pemanggil dan menolak investigasi ganda untuk sesi yang sama', async () => {
		const deps = makeDeps();
		const tasks: Array<() => Promise<unknown>> = [];
		const runInBackground = (task: () => Promise<unknown>) => void tasks.push(task);
		const loadEvents = jest.fn().mockResolvedValue(events);

		expect(startInvestigationInBackground(session, loadEvents, { ...deps, runInBackground })).toBe('started');
		expect(startInvestigationInBackground(session, loadEvents, { ...deps, runInBackground })).toBe('already_running');
		expect(tasks).toHaveLength(1);
		expect(deps.completer.complete).not.toHaveBeenCalled();

		await tasks[0]();
		expect(generationRepo.markGenerationCompleted).toHaveBeenCalled();
		// Setelah selesai, sesi boleh diinvestigasi lagi.
		expect(startInvestigationInBackground(session, loadEvents, { ...deps, runInBackground })).toBe('started');
		await tasks[1]();
	});

	it('startInvestigationInBackground: error di luar persistInvestigation dicatat ke log, tidak hilang', async () => {
		const tasks: Array<() => Promise<unknown>> = [];
		const loadEvents = jest.fn().mockRejectedValue(new Error('DB down'));
		startInvestigationInBackground({ ...session, id_session: 77 }, loadEvents, { ...makeDeps(), runInBackground: (task) => void tasks.push(task) });
		await tasks[0]();
		expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ idSession: 77 }), 'Investigasi background gagal');
	});

	it('persistInvestigation menyimpan kind investigation dan menandai failed bila AI error', async () => {
		const deps = makeDeps();
		deps.completer.complete.mockRejectedValue(new Error('timeout'));
		const result = await persistInvestigation(session, events, deps);
		expect(result).toEqual({ status: 'failed', error: 'timeout' });
		expect(generationRepo.startGeneration).toHaveBeenCalledWith(expect.objectContaining({ idSession: 5, kind: 'investigation' }));
		expect(generationRepo.markGenerationFailed).toHaveBeenCalledWith(21, 'timeout');
	});
});
