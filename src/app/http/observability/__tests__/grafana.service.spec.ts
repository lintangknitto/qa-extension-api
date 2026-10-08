import { GrafanaService } from '../services/grafana.service';

describe('GrafanaService', () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		global.fetch = originalFetch;
		jest.restoreAllMocks();
	});

	it('checkHealth mengembalikan status database ok', async () => {
		const mockFetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ database: 'ok', version: '12.0.1' })
		});
		global.fetch = mockFetch as unknown as typeof fetch;

		const service = new GrafanaService({ baseUrl: 'http://grafana.test' });
		const res = await service.checkHealth();

		expect(res.database).toBe('ok');
		expect(res.version).toBe('12.0.1');
	});

	it('queryLokiLogs memformat logql dan memetakan array values Loki ke ILokiLogEntry', async () => {
		const mockFetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				data: {
					resultType: 'streams',
					result: [
						{
							stream: { app: 'knitto-backend', level: 'error' },
							values: [
								['1696000000000000000', 'Error: Connection timeout at DB pool'],
								['1696000001000000000', 'Unhandled rejection in controller']
							]
						}
					]
				}
			})
		});
		global.fetch = mockFetch as unknown as typeof fetch;

		const service = new GrafanaService({
			baseUrl: 'http://grafana.test',
			lokiUid: 'P8E80F9AEF21F6940'
		});

		const logs = await service.queryLokiLogs('{app="knitto"}', 1696000000000, 1696000010000, 10);

		expect(logs).toHaveLength(2);
		expect(logs[0].line).toBe('Unhandled rejection in controller');
		expect(logs[0].labels?.app).toBe('knitto-backend');
	});
});
