import { correlateSessionLogsUseCase } from '../use-case/correlate-session-logs.use-case';
import * as sessionQueries from '@/app/http/session/queries/session.queries';
import * as recordingEventQueries from '@/app/http/recording/queries/recording-event.queries';
import grafanaService from '../services/grafana.service';
import * as codebaseQueries from '@/app/http/codebase-memory/queries/codebase.queries';
import embeddingService from '@/libs/services/embedding.service';

jest.mock('@/app/http/session/queries/session.queries');
jest.mock('@/app/http/recording/queries/recording-event.queries');
jest.mock('../services/grafana.service');
jest.mock('@/app/http/codebase-memory/queries/codebase.queries');
jest.mock('@/libs/services/embedding.service');

describe('CorrelateSessionLogsUseCase', () => {
	afterEach(() => {
		jest.clearAllMocks();
	});

	it('berhasil mengkorelasikan error event recording dengan log Grafana dan Codebase Memory', async () => {
		jest.spyOn(sessionQueries, 'findSessionById').mockResolvedValue({
			id_session: 1,
			id_project: 1,
			title: 'Checkout Flow Test',
			started_at: '2026-09-30T10:00:00.000Z',
			ended_at: '2026-09-30T10:05:00.000Z',
			target_url: 'http://localhost:3000/checkout'
		});

		jest.spyOn(recordingEventQueries, 'listEventsBySession').mockResolvedValue([
			{
				id_event: 1,
				id_session: 1,
				sequence: 5,
				event_type: 'network_response',
				url: 'http://localhost:3000/api/v1/orders',
				payload: JSON.stringify({ status: 500, error: 'Internal Server Error in order placement' }),
				created_at: '2026-09-30T10:02:00.000Z'
			}
		]);

		jest.spyOn(grafanaService, 'queryLokiLogs').mockResolvedValue([
			{
				timestamp: '2026-09-30T10:02:00.123Z',
				line: 'Error: Cannot read property id_customer of undefined in OrderController.ts',
				labels: { app: 'knitto-order-service' }
			}
		]);

		jest.spyOn(embeddingService, 'generateEmbedding').mockResolvedValue([0.1, 0.2]);
		jest.spyOn(embeddingService, 'formatVectorForPg').mockReturnValue('[0.1,0.2]');

		jest.spyOn(codebaseQueries, 'searchCodebaseChunksByVector').mockResolvedValue([
			{
				id_chunk: 22,
				id_file: 5,
				id_project: 1,
				file_path: 'src/order/order.controller.ts',
				chunk_type: 'symbol',
				content: 'export class OrderController { createOrder() {} }',
				start_line: 15,
				end_line: 45,
				similarity: 0.892,
				metadata: {}
			}
		]);

		const result = await correlateSessionLogsUseCase(1);

		expect(result.session.id_session).toBe(1);
		expect(result.recording_errors).toHaveLength(1);
		expect(result.recording_errors[0].status_code).toBe(500);
		expect(result.grafana_logs).toHaveLength(1);
		expect(result.matched_code_context).toHaveLength(1);
		expect(result.matched_code_context[0].file_path).toBe('src/order/order.controller.ts');
	});
});
