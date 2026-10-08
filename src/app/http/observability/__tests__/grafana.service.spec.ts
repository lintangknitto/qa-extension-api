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
			lokiUid: 'loki-explicit'
		});

		const logs = await service.queryLokiLogs('{app="knitto"}', 1696000000000, 1696000010000, 10);

		expect(logs).toHaveLength(2);
		expect(logs[0].line).toBe('Unhandled rejection in controller');
		expect(logs[0].labels?.app).toBe('knitto-backend');
	});

	describe('resolveDatasourceUid', () => {
		const jsonRes = (body: unknown, ok = true) => ({ ok, json: async () => body });

		it('memakai UID eksplisit tanpa memanggil Grafana', async () => {
			const mockFetch = jest.fn();
			global.fetch = mockFetch as unknown as typeof fetch;
			const service = new GrafanaService({ baseUrl: 'http://grafana.test', lokiUid: 'env-uid' });

			await expect(service.resolveDatasourceUid('loki', 'dash-uid')).resolves.toBe('dash-uid');
			await expect(service.resolveDatasourceUid('loki')).resolves.toBe('env-uid');
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('auto-discover datasource sehat pertama dan meng-cache hasilnya', async () => {
			const mockFetch = jest.fn(async (url: string) => {
				if (url.endsWith('/api/datasources')) {
					return jsonRes([
						{ id: 1, uid: 'prom-1', name: 'P', type: 'prometheus' },
						{ id: 2, uid: 'loki-dead', name: 'L1', type: 'loki' },
						{ id: 3, uid: 'loki-ok', name: 'L2', type: 'loki' }
					]);
				}
				if (url.includes('/loki-dead/health')) return jsonRes({ status: 'ERROR' });
				if (url.includes('/loki-ok/health')) return jsonRes({ status: 'OK' });
				throw new Error(`unexpected ${url}`);
			});
			global.fetch = mockFetch as unknown as typeof fetch;
			const service = new GrafanaService({ baseUrl: 'http://grafana.test', lokiUid: '', prometheusUid: '' });

			await expect(service.resolveDatasourceUid('loki')).resolves.toBe('loki-ok');
			await expect(service.resolveDatasourceUid('loki')).resolves.toBe('loki-ok');
			expect(mockFetch.mock.calls.filter(([u]) => String(u).endsWith('/api/datasources'))).toHaveLength(1);
		});

		it('melempar error bila tidak ada datasource sehat', async () => {
			global.fetch = jest.fn(async (url: string) =>
				url.endsWith('/api/datasources')
					? jsonRes([{ id: 1, uid: 'loki-dead', name: 'L', type: 'loki' }])
					: jsonRes({ status: 'ERROR' })
			) as unknown as typeof fetch;
			const service = new GrafanaService({ baseUrl: 'http://grafana.test', lokiUid: '' });

			await expect(service.resolveDatasourceUid('loki')).rejects.toThrow(/sehat/);
		});
	});
});
