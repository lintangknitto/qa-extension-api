import http from 'http';
import fs from 'fs';
import path from 'path';
import { AddressInfo } from 'net';

export interface ILokiLine {
	timestampMs: number;
	line: string;
}

export interface IMockGrafana {
	baseUrl: string;
	dashboardUid: string;
	/** LogQL yang diterima endpoint query_range, berurutan. */
	lokiQueries: string[];
	addLokiLines: (lines: ILokiLine[]) => void;
	stop: () => Promise<void>;
}

const DASHBOARD_FIXTURE = path.resolve(
	__dirname,
	'../../../src/app/http/observability/__tests__/fixtures/monitoring-logs-docker.dashboard.json'
);

/** Filter `|= "x"` LogQL secara sederhana: baris harus memuat setiap substring yang tidak kosong. */
const matchesLineFilters = (logql: string, line: string): boolean => {
	const filters = Array.from(logql.matchAll(/\|=\s*"((?:[^"\\]|\\.)*)"/g)).map((m) => m[1].replace(/\\(.)/g, '$1'));
	return filters.filter(Boolean).every((needle) => line.includes(needle));
};

/**
 * Grafana palsu untuk E2E investigasi: dashboard "Monitoring Logs Docker" asli dan proxy Loki
 * `query_range` yang mengembalikan baris log yang disuntik test.
 */
export const startMockGrafana = async (): Promise<IMockGrafana> => {
	const dashboardJson = JSON.parse(fs.readFileSync(DASHBOARD_FIXTURE, 'utf-8'));
	const dashboard = dashboardJson.dashboard ?? dashboardJson;
	const lokiLines: ILokiLine[] = [];
	const lokiQueries: string[] = [];

	const server = http.createServer((req, res) => {
		const url = new URL(req.url || '/', 'http://localhost');
		const json = (status: number, body: unknown) => {
			res.writeHead(status, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(body));
		};

		if (url.pathname === `/api/dashboards/uid/${dashboard.uid}`) {
			json(200, { dashboard, meta: { slug: 'monitoring-logs-docker' } });
			return;
		}

		if (/^\/api\/datasources\/proxy\/uid\/[^/]+\/loki\/api\/v1\/query_range$/.test(url.pathname)) {
			const query = url.searchParams.get('query') || '';
			const startMs = Number(url.searchParams.get('start') || 0) / 1e6;
			const endMs = Number(url.searchParams.get('end') || 0) / 1e6;
			lokiQueries.push(query);
			const values = lokiLines
				.filter((l) => l.timestampMs >= startMs && l.timestampMs <= endMs && matchesLineFilters(query, l.line))
				.map((l) => [`${l.timestampMs}000000`, l.line]);
			json(200, { status: 'success', data: { resultType: 'streams', result: [{ stream: { job: 'docker' }, values }] } });
			return;
		}

		json(404, { message: 'Not found' });
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
	const { port } = server.address() as AddressInfo;

	return {
		baseUrl: `http://127.0.0.1:${port}`,
		dashboardUid: dashboard.uid,
		lokiQueries,
		addLokiLines: (lines) => lokiLines.push(...lines),
		stop: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
	};
};
