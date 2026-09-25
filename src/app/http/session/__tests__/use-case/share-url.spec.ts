import { NotFoundException, NotAuthorizationException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { createShareUrlUseCase } from '../../use-case/create-share-url.use-case';
import { getShareContextUseCase } from '../../use-case/get-share-context.use-case';
import { renderShareHtml } from '../../use-case/render-share-page';
import * as queries from '../../queries/session.queries';
import * as repo from '../../repo/session.repo';
import * as eventQueries from '../../../recording/queries/recording-event.queries';
import * as genQueries from '../../../recording/queries/generation.queries';

jest.mock('../../queries/session.queries');
jest.mock('../../repo/session.repo');
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
		video_url: 'http://127.0.0.1:9000/qa-recording-artifacts/video.webm',
		record_video: 1,
		created_at: '2026-09-25 10:00:00'
	};

	beforeEach(() => {
		jest.clearAllMocks();
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
				}
			]);
			(genQueries.listGenerations as jest.Mock).mockResolvedValue([
				{ id_generation: 1, kind: 'playwright', output: 'test("login", async () => {})' }
			]);

			const result = await getShareContextUseCase('valid-token');

			expect(result.session.test_case_no).toBe('TC-AUTH-01');
			expect(result.checkpoints).toHaveLength(1);
			expect(result.failed_requests).toHaveLength(1);
			expect(result.failed_requests[0].status).toBe(500);
			expect(result.console_logs).toHaveLength(1);
			expect(result.playwright_script).toContain('test("login"');
			expect(result.counts.total_failed_requests).toBe(1);
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
			expect(html).toContain('video src=');
		});

		it('merender placeholder kosong saat video_url bernilai null dan tidak ada error network/console', async () => {
			(queries.findSessionByShareToken as jest.Mock).mockResolvedValue({
				...mockSession,
				share_token: 'token-empty',
				video_url: null
			});
			(queries.listCheckpointsBySession as jest.Mock).mockResolvedValue([]);
			(eventQueries.listEventsBySession as jest.Mock).mockResolvedValue([]);
			(genQueries.listGenerations as jest.Mock).mockResolvedValue([]);

			const html = await renderShareHtml('token-empty', 'http://127.0.0.1:8010');

			expect(html).toContain('Tidak ada video terunggah untuk sesi ini.');
			expect(html).toContain('Tidak ada checkpoint yang dicatat.');
			expect(html).toContain('_No HTTP 4xx/5xx requests detected._');
			expect(html).toContain('_No console errors captured._');
		});
	});
});
