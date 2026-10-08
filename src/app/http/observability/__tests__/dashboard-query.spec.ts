import dashboard from './fixtures/monitoring-logs-docker.dashboard.json';
import {
	buildFilteredDashboardUrl,
	effectiveVariables,
	extractLokiTargets,
	parseDashboardUrl,
	renderLogql
} from '../domain/dashboard-query';

const PROGRAM_URL =
	'http://192.168.20.15:3800/d/5cb00b4e-0cd6-44a5-b6e0-361b31c966a5/monitoring-logs-docker?orgId=1&from=now-24h&to=now&timezone=Asia%2FJakarta&var-provider=GCP&var-environment=STAGING&var-cabang=GCP-SANDBOX&var-service=knitto-api-chat-staging&var-search_value=&var-search_value_2=&var-loki_ds=bff5y085q5d6oe';

const model = dashboard as unknown as Record<string, unknown>;

describe('dashboard-query', () => {
	it('parseDashboardUrl mengambil uid dan var-* dari URL program', () => {
		const ref = parseDashboardUrl(PROGRAM_URL)!;
		expect(ref.uid).toBe('5cb00b4e-0cd6-44a5-b6e0-361b31c966a5');
		expect(ref.vars).toMatchObject({ service: 'knitto-api-chat-staging', environment: 'STAGING', loki_ds: 'bff5y085q5d6oe' });
		expect(parseDashboardUrl('https://grafana/explore')).toBeNull();
		expect(parseDashboardUrl('bukan url')).toBeNull();
	});

	it('variabel URL program menimpa default dashboard', () => {
		const vars = effectiveVariables(model, parseDashboardUrl(PROGRAM_URL)!.vars);
		expect(vars.service).toBe('knitto-api-chat-staging');
		expect(vars.cabang).toBe('GCP-SANDBOX');
	});

	it('extractLokiTargets me-resolve datasource ${loki_ds} dari variabel', () => {
		const vars = effectiveVariables(model, parseDashboardUrl(PROGRAM_URL)!.vars);
		const targets = extractLokiTargets(model, vars);
		expect(targets).toHaveLength(1);
		expect(targets[0].datasourceUid).toBe('bff5y085q5d6oe');
		expect(targets[0].expr).toContain('service_name="$service"');
	});

	it('renderLogql mengisi variabel & search_value, membuang filter kosong', () => {
		const vars = effectiveVariables(model, parseDashboardUrl(PROGRAM_URL)!.vars);
		const [target] = extractLokiTargets(model, vars);
		expect(renderLogql(model, target.expr, vars, ['e9b36cf5'])).toBe(
			'{job="docker", cabang="GCP-SANDBOX", environment="STAGING", service_name="knitto-api-chat-staging"} |= "e9b36cf5"'
		);
		expect(renderLogql(model, target.expr, vars, [])).toBe(
			'{job="docker", cabang="GCP-SANDBOX", environment="STAGING", service_name="knitto-api-chat-staging"}'
		);
	});

	it('renderLogql meng-escape kutip dan melonggarkan variabel kosong', () => {
		const expr = '{service_name="$service", level="$level"} |= "$search_value"';
		const dash = { templating: { list: [{ name: 'search_value', type: 'textbox' }] } };
		expect(renderLogql(dash, expr, { service: 'svc', level: '' }, ['say "hi"'])).toBe(
			'{service_name="svc", level=~".+"} |= "say \\"hi\\""'
		);
	});

	it('buildFilteredDashboardUrl mengisi kolom search dan rentang waktu', () => {
		const url = new URL(buildFilteredDashboardUrl(PROGRAM_URL, model, ['/api/chat/send'], { fromMs: 1000, toMs: 2000 }));
		expect(url.searchParams.get('var-search_value')).toBe('/api/chat/send');
		expect(url.searchParams.get('var-service')).toBe('knitto-api-chat-staging');
		expect(url.searchParams.get('from')).toBe('1000');
	});
});
