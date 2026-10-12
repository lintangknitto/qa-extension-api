import { NotFoundException, NotAuthorizationException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { createShareUrlUseCase } from '../../use-case/create-share-url.use-case';
import { getShareContextUseCase } from '../../use-case/get-share-context.use-case';
import { renderShareHtml } from '../../use-case/render-share-page';
import { renderRunsSection, renderStepTimeline, renderTabSwitches, RUNS_SCRIPT, type IShareRun } from '../../use-case/render-share-runs';
import * as queries from '../../queries/session.queries';
import * as repo from '../../repo/session.repo';
import * as runRepo from '../../repo/session-run.repo';
import * as eventQueries from '../../../recording/queries/recording-event.queries';
import * as genQueries from '../../../recording/queries/generation.queries';

jest.mock('../../queries/session.queries');
jest.mock('../../repo/session.repo');
jest.mock('../../repo/session-run.repo');

jest.mock('../../../recording/queries/recording-event.queries');
jest.mock('../../../recording/queries/generation.queries');
jest.mock('../../../project/queries/project.queries', () => ({
	findProjectById: jest.fn().mockResolvedValue({ id_project: 10, name: 'Knitto Web', code: 'knitto-web' })
}));

describe('Share URL & Web Viewer use cases', () => {
	const mockSession: Entity.IQaRecordingSession = {
		id_session: 1,
		id_project: 10,
		test_case_no: 'TC-AUTH-01',
		title: 'Login User Valid',
		description: 'Pengujian login normal',
		target_url: 'https://knitto.id/login',
		owner_user_id: 5,
		status: 'completed',
		result: 'PASS',
		actual_result: 'Login berhasil ke dashboard',
		share_token: null,
		video_url: 'http://127.0.0.1:9000/qa-recording-artifacts/video.webm?X-Amz-Signature=expired',
		video_object_key: 'sessions/1/video/abc.webm',
		record_video: 1,
		created_at: '2026-09-25 10:00:00'
	};

	beforeEach(() => {
		jest.clearAllMocks();
		(runRepo.listRunsBySession as jest.Mock).mockResolvedValue([]);
	});

	describe('createShareUrlUseCase', () => {
		it('men-generate token UUID baru jika session belum memiliki share_token', async () => {
			(queries.findSessionById as jest.Mock).mockResolvedValue(mockSession);
			(repo.updateSessionShareToken as jest.Mock).mockResolvedValue(undefined);

			const result = await createShareUrlUseCase({
				idSession: 1,
				userId: 5,
				userLevel: 'QA',
				baseUrl: 'http://localhost:8010'
			});

			expect(result.share_token).toBeDefined();
			expect(result.share_token.length).toBeGreaterThan(10);
			expect(result.share_url).toContain(`http://localhost:8010/share/${result.share_token}`);
			expect(repo.updateSessionShareToken).toHaveBeenCalledWith(1, result.share_token);
		});

		it('menggunakan share_token yang sudah ada jika sudah terdaftar', async () => {
			const existingToken = 'abc-token-123';
			(queries.findSessionById as jest.Mock).mockResolvedValue({
				...mockSession,
				share_token: existingToken
			});

			const result = await createShareUrlUseCase({
				idSession: 1,
				userId: 5,
				userLevel: 'QA',
				baseUrl: 'http://localhost:8010'
			});

			expect(result.share_token).toBe(existingToken);
			expect(result.share_url).toBe(`http://localhost:8010/share/${existingToken}`);
			expect(repo.updateSessionShareToken).not.toHaveBeenCalled();
		});

		it('melempar NotFoundException jika idSession tidak ditemukan', async () => {
			(queries.findSessionById as jest.Mock).mockResolvedValue(null);

			await expect(
				createShareUrlUseCase({
					idSession: 999,
					userId: 5,
					userLevel: 'QA'
				})
			).rejects.toThrow(NotFoundException);
		});

		it('melempar NotAuthorizationException jika user bukan owner dan bukan level QA/Admin', async () => {
			(queries.findSessionById as jest.Mock).mockResolvedValue(mockSession);

			await expect(
				createShareUrlUseCase({
					idSession: 1,
					userId: 999, // bukan owner
					userLevel: 'GUEST'
				})
			).rejects.toThrow(NotAuthorizationException);
		});
	});

	describe('getShareContextUseCase', () => {
		it('melempar NotFoundException jika token tidak ditemukan', async () => {
			(queries.findSessionByShareToken as jest.Mock).mockResolvedValue(null);

			await expect(getShareContextUseCase('invalid-token')).rejects.toThrow(NotFoundException);
		});

		it('mengagregasi data sesi, failed requests, console errors, checkpoints, dan playwright script', async () => {
			(queries.findSessionByShareToken as jest.Mock).mockResolvedValue({
				...mockSession,
				share_token: 'valid-token'
			});
			(queries.listCheckpointsBySession as jest.Mock).mockResolvedValue([
				{ id_checkpoint: 1, note: 'Buka form login', sequence: 1 }
			]);
			(eventQueries.listEventsBySession as jest.Mock).mockResolvedValue([
				{
					id_event: 1,
					id_session: 1,
					sequence: 1,
					event_type: 'network_request',
					payload: JSON.stringify({
						type: 'network',
						url: 'https://knitto.id/api/login',
						method: 'POST',
						status: 500,
						statusText: 'Internal Server Error',
						duration: 150,
						requestBody: { username: 'tester' },
						responseBody: { message: 'Database error' }
					})
				},
				{
					id_event: 2,
					id_session: 1,
					sequence: 2,
					event_type: 'console_error',
					payload: JSON.stringify({
						level: 'error',
						text: 'Unhandled exception in auth.js'
					})
				},
				{
					id_event: 3,
					id_session: 1,
					sequence: 3,
					event_type: 'tab',
					payload: JSON.stringify({ kind: 'switch', from_tab_id: 1, to_tab_id: 2, title: 'Bayar', url: 'https://pay.example.com' })
				}
			]);
			(genQueries.listGenerations as jest.Mock).mockResolvedValue([
				{ id_generation: 1, kind: 'playwright', output: 'test("login", async () => {})' }
			]);

			(runRepo.listRunsBySession as jest.Mock).mockResolvedValueOnce([
		{ id_run: 1, id_session: 1, run_number: 1, kind: 'original', result: 'PASS', started_at: '2026-10-09T03:05:00Z', video_object_key: 'sessions/1/video/0f8fad5b-d9cb-469f-a165-70867728950e.webm' },
		{ id_run: 2, id_session: 1, run_number: 2, kind: 'rerun', result: 'FAIL', started_at: '2026-10-09T04:00:00Z', video_object_key: 'sessions/1/video/0f8fad5b-d9cb-469f-a165-70867728950e/TC-AUTH-01 - Login - 2026-10-09 11.00 - Run 2.webm' }
	]);

			const result = await getShareContextUseCase('valid-token');

			expect(result.session.test_case_no).toBe('TC-AUTH-01');
			expect(result.checkpoints).toHaveLength(1);
			expect(result.failed_requests).toHaveLength(1);
			expect(result.failed_requests[0].status).toBe(500);
			expect(result.console_logs).toHaveLength(1);
			expect(result.playwright_script).toContain('test("login"');
			expect(result.counts.total_failed_requests).toBe(1);
			expect(result.network_requests).toHaveLength(1);
			expect(result.tab_switches).toEqual([
				expect.objectContaining({ sequence: 3, from_tab_id: 1, to_tab_id: 2, title: 'Bayar', url: 'https://pay.example.com' })
			]);
			expect(result.runs.map((run) => [run.run_number, run.video_file_name])).toEqual([
				[1, 'TC-AUTH-01 - Login User Valid - 2026-10-09 10.05 - Run 1.webm'],
				[2, 'TC-AUTH-01 - Login - 2026-10-09 11.00 - Run 2.webm']
			]);
		});

		it('event aksi masuk user_actions (bukan network walau ber-URL) dan scroll/navigasi/keyboard/tab baru masuk step_events', async () => {
			(queries.findSessionByShareToken as jest.Mock).mockResolvedValue({ ...mockSession, share_token: 'valid-token' });
			(queries.listCheckpointsBySession as jest.Mock).mockResolvedValue([]);
			(genQueries.listGenerations as jest.Mock).mockResolvedValue([]);
			const action = (sequence: number, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
				id_session: 1, sequence, event_type: 'action', url: 'https://knitto.id/chat/1', payload, ...extra
			});
			(eventQueries.listEventsBySession as jest.Mock).mockResolvedValue([
				action(1, { action: 'navigation', url: 'https://knitto.id/chat/1', navigation_type: 'reload' }),
				action(2, { action: 'scroll', element: null, scroll_x: 0, scroll_y: 800, delta_x: 0, delta_y: 800 }),
				action(3, { action: 'keydown', key: 'Enter', modifiers: ['Control'], unique_locator: "getByPlaceholder('Pesan')" }),
				action(4, { action: 'input', unique_locator: "getByLabel('Password')", value: null, value_redacted: true }),
				{ id_session: 1, sequence: 5, event_type: 'tab', payload: { kind: 'opened', tab_id: 2, opener_tab_id: 1, url: 'https://knitto.id/inv' } }
			]);
			const result = await getShareContextUseCase('valid-token');
			expect(result.network_requests).toHaveLength(0);
			expect(result.user_actions.map((a) => [a.sequence, a.action_type, a.target_selector ?? null, a.value ?? null])).toEqual([
				[1, 'navigation', null, null],
				[2, 'scroll', null, null],
				[3, 'keydown', "getByPlaceholder('Pesan')", null],
				[4, 'input', "getByLabel('Password')", null]
			]);
			expect(result.step_events.map((s) => [s.sequence, s.kind, s.label])).toEqual([
				[1, 'navigation', 'Navigasi (muat ulang) ke https://knitto.id/chat/1'],
				[2, 'scroll', 'Scroll halaman ke (0, 800), Δ (0, 800)'],
				[3, 'keyboard', "Tombol Control+Enter pada getByPlaceholder('Pesan')"],
				[5, 'tab', 'Tab baru dibuka dari aksi: https://knitto.id/inv']
			]);
		});
	});

	describe('renderStepTimeline', () => {
		it('menggabungkan langkah & checkpoint urut sequence, menampilkan target, dan meng-escape semua nilai', () => {
			const html = renderStepTimeline(
				[
					{ note: 'Toast <b>muncul</b>', sequence: 2, target_locators: ["getByRole('status')"], target_text: '<img src=x onerror=alert(1)>', page_url: 'https://a.test/x?q="1"' },
					{ note: 'Akhir', sequence: null }
				],
				[
					{ sequence: 2, kind: 'scroll', label: 'Scroll halaman ke (0, 800), Δ (0, 800)' },
					{ sequence: 1, kind: 'navigation', label: 'Navigasi (ketik URL) ke https://a.test/<script>' }
				]
			);
			const order = ['Navigasi (ketik URL)', 'Scroll halaman', 'Toast &lt;b&gt;muncul', 'Akhir'].map((text) => html.indexOf(text));
			expect(order.every((pos, i) => pos >= 0 && (i === 0 || pos > order[i - 1]))).toBe(true);
			expect(html).toContain('🎯 elemen getByRole(&#39;status&#39;) berisi');
			expect(html).not.toContain('<img src=x');
			expect(html).not.toContain('<script>');
			expect(html).not.toContain('<b>muncul');
			expect(renderStepTimeline([], [])).toBe('');
		});
	});

	describe('renderRunsSection', () => {
		const run = (n: number, extra: Partial<IShareRun> = {}): IShareRun => ({
			run_number: n,
			kind: n === 1 ? 'original' : 'rerun',
			result: 'PASS',
			actual_result: null,
			video_url: `http://minio/b/v${n}.webm`,
			video_file_name: `TC - Run ${n}.webm`,
			...extra
		});

		it('merender tab per run dengan Run #1 sebagai default dan Download bernama per run', () => {
			const html = renderRunsSection([run(1), run(2, { result: 'FAIL' })], run(1));
			expect(html).toContain('id="run-tab-1" aria-controls="run-panel-1" aria-selected="true"');
			expect(html).toContain('id="run-tab-2" aria-controls="run-panel-2" aria-selected="false"');
			expect(html).toContain('Run #1 (Asli)');
			expect(html).toMatch(/id="run-panel-2" aria-hidden="true" hidden/);
			expect(html).toContain('download="TC - Run 2.webm" data-file-name="TC - Run 2.webm" onclick="return downloadRunVideo(event, this)"');
			expect(html).toContain('FAILED');
		});

		it('meng-escape nilai run', () => {
			const html = renderRunsSection([run(1, { actual_result: '<img src=x onerror=alert(1)>', video_file_name: '"><script>.webm' })], run(1));
			expect(html).not.toContain('<img src=x');
			expect(html).not.toContain('"><script>');
			expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
		});

		it('memakai fallback sebagai Run #1 tanpa tab bila riwayat kosong', () => {
			const html = renderRunsSection([], run(1, { video_url: null }));
			expect(html).not.toContain('role="tablist"');
			expect(html).toContain('Tidak ada video terunggah untuk run ini.');
		});

		it('script Download memakai blob dengan fallback link langsung', () => {
			expect(RUNS_SCRIPT).toContain('res.blob()');
			expect(RUNS_SCRIPT).toContain('a.download = name');
			expect(RUNS_SCRIPT).toContain("window.open(href, '_blank', 'noopener')");
		});

		it('renderTabSwitches menampilkan judul atau host tab tujuan', () => {
			const html = renderTabSwitches([
				{ sequence: 4, title: 'Bayar', url: 'https://pay.example.com/x' },
				{ sequence: 9, title: null, url: 'https://oauth.example.com/login' }
			]);
			expect(html).toContain('Pindah ke tab: Bayar <span style="color: var(--text-muted);">(pay.example.com)</span>');
			expect(html).toContain('Pindah ke tab: oauth.example.com');
			expect(renderTabSwitches([])).toBe('');
		});
	});

	describe('renderShareHtml', () => {
		it('merender HTML responsif lengkap dengan tag AI payload dan script Playwright', async () => {
			(queries.findSessionByShareToken as jest.Mock).mockResolvedValue({
				...mockSession,
				share_token: 'token-abc'
			});
			(queries.listCheckpointsBySession as jest.Mock).mockResolvedValue([
				{ id_checkpoint: 1, note: 'Langkah pertama', sequence: 1 }
			]);
			(eventQueries.listEventsBySession as jest.Mock).mockResolvedValue([]);
			(genQueries.listGenerations as jest.Mock).mockResolvedValue([
				{ id_generation: 1, kind: 'playwright', output: '// Playwright code here' }
			]);

			const html = await renderShareHtml('token-abc', 'http://127.0.0.1:8010');

			expect(html).toContain('<!DOCTYPE html>');
			expect(html).toContain('TC-AUTH-01');
			expect(html).toContain('Login User Valid');
			expect(html).toContain('id="ai-debug-payload"');
			expect(html).toContain('Salin Konteks untuk AI Agent');
			expect(html).toMatch(/<video src="[^"]*\/qa-recording-artifacts\/sessions\/1\/video\/abc\.webm"/);
			expect(html).not.toContain('/share/token-abc/video');
			expect(html).not.toContain('X-Amz-Signature');
		});

		it('merender placeholder kosong saat video_url bernilai null dan tidak ada error network/console', async () => {
			(queries.findSessionByShareToken as jest.Mock).mockResolvedValue({
				...mockSession,
				share_token: 'token-empty',
				video_url: null,
				video_object_key: null
			});
			(queries.listCheckpointsBySession as jest.Mock).mockResolvedValue([]);
			(eventQueries.listEventsBySession as jest.Mock).mockResolvedValue([]);
			(genQueries.listGenerations as jest.Mock).mockResolvedValue([]);

			const html = await renderShareHtml('token-empty', 'http://127.0.0.1:8010');

			expect(html).toContain('Tidak ada video terunggah untuk run ini.');
			expect(html).toContain('Tidak ada checkpoint yang dicatat.');
			expect(html).toContain('_No HTTP 4xx/5xx requests detected._');
			expect(html).toContain('_No console errors captured._');
		});
	});
});
