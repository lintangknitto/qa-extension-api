import { grafanaConfig } from '@/libs/config';
import { GeneralException } from '@knittotextile/knitto-core-backend/dist/CoreException';

export interface IGrafanaDatasource {
	id: number;
	uid: string;
	name: string;
	type: string;
	isDefault?: boolean;
}

export interface ILokiLogEntry {
	timestamp: string;
	line: string;
	labels?: Record<string, string>;
}

export class GrafanaService {
	private readonly baseUrl: string;
	private readonly token: string;
	private readonly lokiUid: string;
	private readonly prometheusUid: string;

	constructor(config?: {
		baseUrl?: string;
		token?: string;
		lokiUid?: string;
		prometheusUid?: string;
	}) {
		this.baseUrl = (config?.baseUrl || grafanaConfig.URL).replace(/\/+$/, '');
		this.token = config?.token || grafanaConfig.SERVICE_ACCOUNT_TOKEN;
		this.lokiUid = config?.lokiUid || grafanaConfig.LOKI_UID;
		this.prometheusUid = config?.prometheusUid || grafanaConfig.PROMETHEUS_UID;
	}

	private getHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			Accept: 'application/json',
			'Content-Type': 'application/json'
		};
		if (this.token) {
			headers['Authorization'] = `Bearer ${this.token}`;
		}
		return headers;
	}

	public async checkHealth(): Promise<{ database: string; version?: string }> {
		try {
			const res = await fetch(`${this.baseUrl}/api/health`, {
				headers: this.getHeaders()
			});
			if (!res.ok) throw new GeneralException(`Grafana health error: HTTP ${res.status}`);
			return (await res.json()) as { database: string; version?: string };
		} catch (err: unknown) {
			if (err instanceof GeneralException) throw err;
			throw new GeneralException(`Gagal menghubungi Grafana: ${(err as Error).message}`);
		}
	}

	public async listDatasources(): Promise<IGrafanaDatasource[]> {
		try {
			const res = await fetch(`${this.baseUrl}/api/datasources`, {
				headers: this.getHeaders()
			});
			if (!res.ok) throw new GeneralException(`Grafana datasources error: HTTP ${res.status}`);
			return (await res.json()) as IGrafanaDatasource[];
		} catch (err: unknown) {
			if (err instanceof GeneralException) throw err;
			throw new GeneralException(`Gagal mengambil datasources Grafana: ${(err as Error).message}`);
		}
	}

	public async queryLokiLogs(
		logql: string,
		fromEpochMs: number,
		toEpochMs: number,
		limit = 50,
		customLokiUid?: string
	): Promise<ILokiLogEntry[]> {
		const uid = customLokiUid || this.lokiUid;
		const startNs = `${fromEpochMs}000000`;
		const endNs = `${toEpochMs}000000`;
		const queryParams = new URLSearchParams({
			query: logql,
			start: startNs,
			end: endNs,
			limit: String(limit),
			direction: 'backward'
		});

		const endpoint = `${this.baseUrl}/api/datasources/proxy/uid/${uid}/loki/api/v1/query_range?${queryParams.toString()}`;

		try {
			const res = await fetch(endpoint, {
				method: 'GET',
				headers: this.getHeaders()
			});

			if (!res.ok) {
				const errBody = await res.text();
				throw new GeneralException(`Loki query HTTP ${res.status}: ${errBody || res.statusText}`);
			}

			const json = (await res.json()) as {
				data?: {
					resultType?: string;
					result?: Array<{
						stream?: Record<string, string>;
						values?: Array<[string, string]>; // [timestamp_ns, log_line]
					}>;
				};
			};

			const logs: ILokiLogEntry[] = [];
			const result = json.data?.result || [];

			for (const streamItem of result) {
				const labels = streamItem.stream || {};
				for (const val of streamItem.values || []) {
					const [tsNs, line] = val;
					const tsMs = Math.floor(Number(tsNs) / 1000000);
					logs.push({
						timestamp: new Date(tsMs).toISOString(),
						line,
						labels
					});
				}
			}

			// Sort newest to oldest
			logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
			return logs.slice(0, limit);
		} catch (err: unknown) {
			if (err instanceof GeneralException) throw err;
			throw new GeneralException(`Gagal query log ke Grafana Loki (${endpoint}): ${(err as Error).message}`);
		}
	}

	public async queryPrometheus(
		promql: string,
		timeEpochMs?: number,
		customPrometheusUid?: string
	): Promise<unknown> {
		const uid = customPrometheusUid || this.prometheusUid;
		const queryParams = new URLSearchParams({
			query: promql
		});
		if (timeEpochMs) {
			queryParams.set('time', String(Math.floor(timeEpochMs / 1000)));
		}

		const endpoint = `${this.baseUrl}/api/datasources/proxy/uid/${uid}/api/v1/query?${queryParams.toString()}`;

		try {
			const res = await fetch(endpoint, {
				method: 'GET',
				headers: this.getHeaders()
			});

			if (!res.ok) {
				const errBody = await res.text();
				throw new GeneralException(`Prometheus query HTTP ${res.status}: ${errBody || res.statusText}`);
			}

			return await res.json();
		} catch (err: unknown) {
			if (err instanceof GeneralException) throw err;
			throw new GeneralException(`Gagal query Prometheus: ${(err as Error).message}`);
		}
	}
}

export default new GrafanaService();
