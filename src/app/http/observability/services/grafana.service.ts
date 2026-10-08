import { grafanaConfig } from '@/libs/config';
import { GeneralException } from '@knittotextile/knitto-core-backend/dist/CoreException';

/** Batas waktu per request ke Grafana: Grafana yang lambat/hang tidak boleh menggantung investigasi. */
const GRAFANA_REQUEST_TIMEOUT_MS = 10_000;

export interface IGrafanaDatasource {
	id: number;
	uid: string;
	name: string;
	type: string;
	isDefault?: boolean;
}

export interface ILokiLogEntry {
	timestamp: string;
	/** Timestamp asli Loki (nanodetik) — menjaga urutan baris log multiline dalam milidetik yang sama. */
	timestampNs?: string;
	line: string;
	labels?: Record<string, string>;
}

/** Bandingkan timestamp nanodetik (string) tanpa kehilangan presisi. */
export const compareNs = (a?: string, b?: string): number => {
	const x = a ?? '0';
	const y = b ?? '0';
	return x.length !== y.length ? x.length - y.length : x < y ? -1 : x > y ? 1 : 0;
};

export class GrafanaService {
	private readonly baseUrl: string;
	private readonly token: string;
	private readonly lokiUid: string;
	private readonly prometheusUid: string;
	private readonly discoveredUids = new Map<string, Promise<string>>();

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
				headers: this.getHeaders(),
				signal: AbortSignal.timeout(GRAFANA_REQUEST_TIMEOUT_MS)
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
				headers: this.getHeaders(),
				signal: AbortSignal.timeout(GRAFANA_REQUEST_TIMEOUT_MS)
			});
			if (!res.ok) throw new GeneralException(`Grafana datasources error: HTTP ${res.status}`);
			return (await res.json()) as IGrafanaDatasource[];
		} catch (err: unknown) {
			if (err instanceof GeneralException) throw err;
			throw new GeneralException(`Gagal mengambil datasources Grafana: ${(err as Error).message}`);
		}
	}

	/** Model JSON dashboard (panel + templating) via `/api/dashboards/uid/:uid`. */
	public async getDashboard(uid: string): Promise<Record<string, unknown>> {
		try {
			const res = await fetch(`${this.baseUrl}/api/dashboards/uid/${encodeURIComponent(uid)}`, {
				headers: this.getHeaders(),
				signal: AbortSignal.timeout(GRAFANA_REQUEST_TIMEOUT_MS)
			});
			if (!res.ok) throw new GeneralException(`Grafana dashboard ${uid} error: HTTP ${res.status}`);
			const body = (await res.json()) as { dashboard?: Record<string, unknown> };
			if (!body.dashboard) throw new GeneralException(`Dashboard ${uid} tidak memiliki model.`);
			return body.dashboard;
		} catch (err: unknown) {
			if (err instanceof GeneralException) throw err;
			throw new GeneralException(`Gagal mengambil dashboard Grafana: ${(err as Error).message}`);
		}
	}

	/**
	 * Menentukan UID datasource secara dinamis: UID eksplisit (mis. dari URL dashboard
	 * program) > env override > datasource bertipe sama pertama yang lolos health check.
	 * Hasil discovery di-cache per tipe; cache dibuang bila discovery gagal.
	 */
	public async resolveDatasourceUid(type: 'loki' | 'prometheus', explicitUid?: string): Promise<string> {
		if (explicitUid) return explicitUid;
		const configured = type === 'loki' ? this.lokiUid : this.prometheusUid;
		if (configured) return configured;

		let pending = this.discoveredUids.get(type);
		if (!pending) {
			pending = this.discoverHealthyDatasource(type);
			this.discoveredUids.set(type, pending);
			pending.catch(() => this.discoveredUids.delete(type));
		}
		return pending;
	}

	private async discoverHealthyDatasource(type: 'loki' | 'prometheus'): Promise<string> {
		const candidates = (await this.listDatasources()).filter((ds) => ds.type === type);
		// Default datasource dicoba lebih dulu.
		candidates.sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)));
		for (const ds of candidates) {
			if (await this.isDatasourceHealthy(ds.uid)) return ds.uid;
		}
		throw new GeneralException(`Tidak ada datasource Grafana bertipe ${type} yang sehat.`);
	}

	private async isDatasourceHealthy(uid: string): Promise<boolean> {
		try {
			const res = await fetch(`${this.baseUrl}/api/datasources/uid/${uid}/health`, {
				headers: this.getHeaders(),
				signal: AbortSignal.timeout(GRAFANA_REQUEST_TIMEOUT_MS)
			});
			if (!res.ok) return false;
			const body = (await res.json()) as { status?: string };
			return body.status === 'OK';
		} catch {
			return false;
		}
	}

	public async queryLokiLogs(
		logql: string,
		fromEpochMs: number,
		toEpochMs: number,
		limit = 50,
		customLokiUid?: string
	): Promise<ILokiLogEntry[]> {
		const uid = await this.resolveDatasourceUid('loki', customLokiUid);
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
				headers: this.getHeaders(),
				signal: AbortSignal.timeout(GRAFANA_REQUEST_TIMEOUT_MS)
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
						timestampNs: tsNs,
						line,
						labels
					});
				}
			}

			// Sort newest to oldest
			logs.sort((a, b) => compareNs(b.timestampNs, a.timestampNs));
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
		const uid = await this.resolveDatasourceUid('prometheus', customPrometheusUid);
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
				headers: this.getHeaders(),
				signal: AbortSignal.timeout(GRAFANA_REQUEST_TIMEOUT_MS)
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
