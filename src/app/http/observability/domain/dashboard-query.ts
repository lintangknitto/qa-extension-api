/**
 * Membaca konfigurasi log program dari URL dashboard Grafana-nya: UID dashboard,
 * variabel `var-*` (datasource Loki, service, environment, dll.), lalu merender
 * query panel Loki dengan variabel tersebut. Variabel textbox (mis. `search_value`)
 * diisi kata kunci investigasi (requestId/path) — persis seperti tim mengetik di
 * kolom search dashboard.
 */

export interface DashboardRef {
	uid: string;
	baseUrl: string;
	vars: Record<string, string>;
}

export interface DashboardLokiTarget {
	panelTitle: string;
	datasourceUid: string;
	/** Ekspresi LogQL mentah (masih berisi variabel). */
	expr: string;
}

interface TemplateVariable {
	name: string;
	type: string;
	current?: string;
	query?: string;
}

export const parseDashboardUrl = (url: string | null | undefined): DashboardRef | null => {
	if (!url) return null;
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	const match = /\/d\/([^/?#]+)/.exec(parsed.pathname);
	if (!match) return null;
	const vars: Record<string, string> = {};
	parsed.searchParams.forEach((value, key) => {
		if (key.startsWith('var-')) vars[key.slice(4)] = value;
	});
	return { uid: match[1], baseUrl: `${parsed.origin}${parsed.pathname.slice(0, match.index)}`, vars };
};

const asText = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const currentValue = (current: unknown): string | undefined => {
	const value = asRecord(current).value;
	if (Array.isArray(value)) return value.length === 1 ? String(value[0]) : undefined;
	return typeof value === 'string' ? value : undefined;
};

export const listTemplateVariables = (dashboard: Record<string, unknown>): TemplateVariable[] => {
	const list = asRecord(dashboard.templating).list;
	if (!Array.isArray(list)) return [];
	return list.map((raw) => {
		const v = asRecord(raw);
		return {
			name: asText(v.name),
			type: asText(v.type),
			current: currentValue(v.current),
			query: typeof v.query === 'string' ? v.query : undefined
		};
	});
};

const VAR_PATTERN = /\$\{(\w+)(?::\w+)?\}|\$(\w+)|\[\[(\w+)\]\]/g;

const resolveVarRef = (value: string, vars: Record<string, string>): string =>
	value.replace(VAR_PATTERN, (whole, a, b, c) => vars[a ?? b ?? c] ?? whole);

const flattenPanels = (panels: unknown): Record<string, unknown>[] => {
	if (!Array.isArray(panels)) return [];
	return panels.flatMap((panel) => {
		const p = asRecord(panel);
		return [p, ...flattenPanels(p.panels)];
	});
};

/** Variabel efektif: default dashboard (current) ditimpa nilai dari URL program. */
export const effectiveVariables = (dashboard: Record<string, unknown>, urlVars: Record<string, string>): Record<string, string> => {
	const vars: Record<string, string> = {};
	for (const v of listTemplateVariables(dashboard)) {
		if (v.current !== undefined) vars[v.name] = v.current;
	}
	return { ...vars, ...urlVars };
};

/** Target panel yang datasource-nya Loki (langsung atau lewat variabel datasource). */
export const extractLokiTargets = (dashboard: Record<string, unknown>, vars: Record<string, string>): DashboardLokiTarget[] => {
	const datasourceVars = new Set(listTemplateVariables(dashboard).filter((v) => v.type === 'datasource' && v.query === 'loki').map((v) => v.name));
	const targets: DashboardLokiTarget[] = [];
	for (const panel of flattenPanels(dashboard.panels)) {
		const panelDs = asRecord(panel.datasource);
		for (const rawTarget of Array.isArray(panel.targets) ? panel.targets : []) {
			const target = asRecord(rawTarget);
			const ds = Object.keys(asRecord(target.datasource)).length > 0 ? asRecord(target.datasource) : panelDs;
			const uidRaw = asText(ds.uid);
			const varName = /^\$\{?(\w+)\}?$/.exec(uidRaw)?.[1];
			const isLoki = ds.type === 'loki' || (varName !== undefined && datasourceVars.has(varName));
			const expr = typeof target.expr === 'string' ? target.expr : '';
			if (!isLoki || !expr.trim()) continue;
			const datasourceUid = resolveVarRef(uidRaw, vars);
			if (!datasourceUid || datasourceUid.includes('$')) continue;
			targets.push({ panelTitle: asText(panel.title), datasourceUid, expr });
		}
	}
	return targets;
};

const escapeLogqlString = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/**
 * Merender LogQL: variabel textbox diisi `searchTerms` berurutan, variabel lain dari
 * `vars`; filter baris kosong (`|= ""`) dibuang; matcher label yang nilainya kosong
 * atau `$__all` dilonggarkan menjadi `=~".+"`.
 */
export const renderLogql = (
	dashboard: Record<string, unknown>,
	expr: string,
	vars: Record<string, string>,
	searchTerms: string[]
): string => {
	const textboxes = listTemplateVariables(dashboard)
		.filter((v) => v.type === 'textbox')
		.map((v) => v.name);
	const values: Record<string, string> = { ...vars };
	textboxes.forEach((name, index) => {
		values[name] = searchTerms[index] ?? '';
	});

	let out = expr;
	// Matcher label dengan variabel kosong/All → regex longgar.
	out = out.replace(/(\w+)\s*=\s*"(\$\{(\w+)(?::\w+)?\}|\$(\w+)|\[\[(\w+)\]\])"/g, (whole, label, _ref, a, b, c) => {
		const value = values[a ?? b ?? c];
		if (value === undefined) return whole;
		if (value === '' || value === '$__all' || value === 'All') return `${label}=~".+"`;
		return `${label}="${escapeLogqlString(value)}"`;
	});
	// Variabel lain di dalam string LogQL.
	out = out.replace(VAR_PATTERN, (whole, a, b, c) => {
		const value = values[a ?? b ?? c];
		return value === undefined ? whole : escapeLogqlString(value);
	});
	// Filter baris kosong tidak berguna (dan bisa membuat Loki menolak query).
	out = out.replace(/\s*\|[=~]\s*""/g, '').replace(/\s*!=\s*""/g, '');
	return out.trim();
};

/** Link dashboard dengan kolom search terisi kata kunci, untuk dibuka manusia. */
export const buildFilteredDashboardUrl = (
	originalUrl: string,
	dashboard: Record<string, unknown>,
	searchTerms: string[],
	range?: { fromMs: number; toMs: number }
): string => {
	const url = new URL(originalUrl);
	const textboxes = listTemplateVariables(dashboard)
		.filter((v) => v.type === 'textbox')
		.map((v) => v.name);
	textboxes.forEach((name, index) => url.searchParams.set(`var-${name}`, searchTerms[index] ?? ''));
	if (range) {
		url.searchParams.set('from', String(range.fromMs));
		url.searchParams.set('to', String(range.toMs));
	}
	return url.toString();
};
