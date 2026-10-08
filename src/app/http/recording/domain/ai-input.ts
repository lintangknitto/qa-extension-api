/**
 * Builder input AI. Menerima data yang SUDAH direduksi (redaction) dan
 * menyusunnya menjadi konteks terstruktur + anomaly list.
 */
export interface IAiInputEvent {
	type: string;
	sequence: number;
	occurredAt?: string | null;
	url?: string | null;
	payload: Record<string, unknown>;
}

export interface IAiInputCheckpoint {
	sequence?: number | null;
	note?: string | null;
	created_at?: string | null;
}

export interface IAiSessionInput {
	session: {
		test_case_no?: string | null;
		title?: string | null;
		description?: string | null;
		target_url?: string | null;
		result?: string | null;
		actual_result?: string | null;
	};
	events: IAiInputEvent[];
	checkpoints: IAiInputCheckpoint[];
}

export interface IAiAnomalies {
	consoleAnomalies: string[];
	networkAnomalies: string[];
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const safeJsonParse = (value: string | null | undefined): Record<string, unknown> => {
	if (!value) return {};
	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
};

/**
 * Mengubah baris event tersimpan (payload string) menjadi input AI (payload object).
 */
export const parseStoredEvent = (row: Entity.IQaRecordingEvent): IAiInputEvent => ({
	type: row.event_type ?? '',
	sequence: Number(row.sequence ?? 0),
	occurredAt: row.occurred_at ?? null,
	url: row.url ?? null,
	payload: safeJsonParse(row.payload)
});

const collectConsoleAnomaly = (event: IAiInputEvent, anomalies: string[]): void => {
	const level = asString(event.payload.level) || (event.type === 'exception' ? 'error' : 'log');
	if (level === 'error' || level === 'warning' || level === 'warn' || event.type === 'exception') {
		const text = asString(event.payload.text) || asString(event.payload.message);
		anomalies.push(`#${event.sequence} [${level}] ${text}`.trim());
	}
};

const collectNetworkAnomaly = (event: IAiInputEvent, anomalies: string[]): void => {
	const status = Number(event.payload.status ?? 0);
	const method = asString(event.payload.method) || 'GET';
	const url = event.url ?? asString(event.payload.url);
	const failed = status >= 400 || event.payload.failed === true;
	if (failed) anomalies.push(`#${event.sequence} ${method} ${status || 'ERR'} ${url}`.trim());
};

export const collectAnomalies = (events: IAiInputEvent[]): IAiAnomalies => {
	const consoleAnomalies: string[] = [];
	const networkAnomalies: string[] = [];

	for (const event of events) {
		if (event.type === 'console' || event.type === 'exception')
			collectConsoleAnomaly(event, consoleAnomalies);

		if (event.type === 'network') collectNetworkAnomaly(event, networkAnomalies);
	}

	return { consoleAnomalies, networkAnomalies };
};

export const summarizeEventCounts = (events: IAiInputEvent[]) => ({
	total: events.length,
	actions: events.filter((event) => event.type === 'action').length,
	console: events.filter((event) => event.type === 'console' || event.type === 'exception').length,
	network: events.filter((event) => event.type === 'network').length,
	artifacts: events.filter((event) => event.type === 'artifact').length
});

const isInternalExtensionEvent = (event: IAiInputEvent): boolean => {
	const rawLocators = Array.isArray(event.payload.locators)
		? (event.payload.locators as unknown[]).filter((l): l is string => typeof l === 'string')
		: [];
	const fallbackTarget = asString(event.payload.selector) || asString(event.payload.locator) || '';
	const allLocs = [...rawLocators, fallbackTarget].join(' ');
	if (allLocs.includes('qa-knitto-fab-host') || allLocs.includes('qa-knitto-')) return true;

	const element = (event.payload.element && typeof event.payload.element === 'object')
		? (event.payload.element as Record<string, unknown>)
		: null;
	if (element) {
		const id = asString(element.id);
		const testId = asString(element.testId);
		const cssPath = asString(element.cssPath);
		if (id.includes('qa-knitto') || testId.includes('qa-knitto') || cssPath.includes('qa-knitto')) return true;
	}
	return false;
};

const formatLocatorsSection = (locators: string[], fallbackTarget: string): string[] => {
	const parts: string[] = [];
	if (locators.length > 0) {
		const firstLoc = locators[0].startsWith('page.') || locators[0].startsWith('locator(') || locators[0].startsWith('getBy')
			? (locators[0].startsWith('page.') ? locators[0] : `page.${locators[0]}`)
			: locators[0];
		parts.push(`Primary Locator: ${firstLoc}`);
		if (locators.length > 1) {
			const altList = locators.slice(1, 4).map((l) =>
				l.startsWith('page.') || l.startsWith('locator(') || l.startsWith('getBy')
					? (l.startsWith('page.') ? l : `page.${l}`)
					: l
			).join(' | ');
			parts.push(`Alternatif: [${altList}]`);
		}
	} else if (fallbackTarget) {
		parts.push(`Target: ${fallbackTarget}`);
	}
	return parts;
};

const formatElementMetadata = (element: Record<string, unknown> | null, labelFallback: unknown): string[] => {
	if (!element) return labelFallback ? [`Elemen: text="${asString(labelFallback).slice(0, 80)}"`] : [];
	const tag = asString(element.tagName).toLowerCase();
	const elText = asString(element.text) || asString(labelFallback);
	const elRole = asString(element.role);
	const elPlaceholder = asString(element.placeholder);
	const elTestId = asString(element.testId);
	const elName = asString(element.name);
	const elType = asString(element.type);

	const meta: string[] = [];
	if (tag) meta.push(`<${tag}>`);
	if (elTestId) meta.push(`data-testid="${elTestId}"`);
	if (elRole) meta.push(`role="${elRole}"`);
	if (elName) meta.push(`name="${elName}"`);
	if (elPlaceholder) meta.push(`placeholder="${elPlaceholder}"`);
	if (elType) meta.push(`type="${elType}"`);
	if (elText) meta.push(`text="${elText.slice(0, 80)}"`);
	return meta.length > 0 ? [`Elemen: ${meta.join(' ')}`] : [];
};

const formatActionValues = (actionKind: string, payload: Record<string, unknown>): string[] => {
	const parts: string[] = [];
	if (actionKind === 'input' || actionKind === 'fill') {
		if (payload.value_redacted === true) {
			parts.push('Input Value: [REDACTED/SENSITIF]');
		} else if (payload.value !== undefined && payload.value !== null) {
			parts.push(`Input Value: ${JSON.stringify(payload.value)}`);
		}
	} else if (actionKind === 'change') {
		if (payload.selectedText) {
			parts.push(`Pilih Opsi: ${JSON.stringify(payload.selectedText)}`);
		}
		if (payload.checked !== undefined) {
			parts.push(`Centang: ${Boolean(payload.checked)}`);
		}
		if (payload.value !== undefined && payload.value !== null && !payload.selectedText) {
			parts.push(payload.value_redacted === true ? 'Value: [REDACTED/SENSITIF]' : `Value: ${JSON.stringify(payload.value)}`);
		}
	} else if (actionKind === 'keydown') {
		const key = asString(payload.key) || 'Enter';
		parts.push(`Tekan Tombol: "${key}"`);
	}
	return parts;
};

const extractLocators = (payload: Record<string, unknown>, fallbackUrl?: string | null): { locators: string[]; fallbackTarget: string } => {
	const rawLocators = Array.isArray(payload.locators)
		? (payload.locators as unknown[]).filter((l): l is string => typeof l === 'string' && l.length > 0)
		: [];
	const fallbackTarget = asString(payload.selector) || asString(payload.locator) || fallbackUrl || '';
	const locators = rawLocators.length > 0 ? rawLocators : (fallbackTarget ? [fallbackTarget] : []);
	return { locators, fallbackTarget };
};

const formatActionEvent = (event: IAiInputEvent, stepIndex: number): string => {
	const actionKind = (asString(event.payload.action) || asString(event.payload.type) || 'action').toLowerCase();
	const { locators, fallbackTarget } = extractLocators(event.payload, event.url);

	const element = (event.payload.element && typeof event.payload.element === 'object')
		? (event.payload.element as Record<string, unknown>)
		: null;

	const parts = [
		...formatLocatorsSection(locators, fallbackTarget),
		...formatElementMetadata(element, event.payload.label),
		...formatActionValues(actionKind, event.payload)
	];

	const detailStr = parts.length > 0 ? ` -> ${parts.join(' | ')}` : (fallbackTarget ? ` ${fallbackTarget}` : '');
	return `${stepIndex}. [${actionKind.toUpperCase()}]${detailStr}`;
};

const formatStepEvent = (event: IAiInputEvent, stepIndex: number): string | null => {
	if (event.type === 'navigation') {
		const targetUrl = asString(event.payload.url) || event.url || '';
		return `${stepIndex}. [NAVIGATE] Buka URL: ${targetUrl || '(tidak ada url)'}`;
	}

	if (event.type === 'action') {
		return formatActionEvent(event, stepIndex);
	}

	return null;
};

const renderSteps = (events: IAiInputEvent[]): string => {
	const stepEvents = events
		.filter((event) => (event.type === 'action' || event.type === 'navigation') && !isInternalExtensionEvent(event))
		.slice(0, 300);
	if (stepEvents.length === 0) return '(tidak ada action tercatat)';
	const lines: string[] = [];
	let stepIndex = 1;
	for (const event of stepEvents) {
		const rendered = formatStepEvent(event, stepIndex++);
		if (rendered) lines.push(rendered);
	}
	return lines.length > 0 ? lines.join('\n') : '(tidak ada action tercatat)';
};

export const buildAiSessionContext = (input: IAiSessionInput): string => {
	const anomalies = collectAnomalies(input.events);
	const counts = summarizeEventCounts(input.events);

	const checkpointLines =
		input.checkpoints.length > 0
			? input.checkpoints
				.map((cp) => `- ${cp.sequence !== null && cp.sequence !== undefined ? `#${cp.sequence} ` : ''}${cp.note ?? ''}`)
				.join('\n')
			: '(tidak ada checkpoint)';

	const actualNavUrl = input.events.find(
		(e) => Boolean(e.url && (e.type === 'action' || e.type === 'navigate' || e.type === 'dom-snapshot') && !e.url.includes('/api/') && !e.url.includes('api-'))
	)?.url;

	return [
		'## Identitas Test Case',
		`Nomor: ${input.session.test_case_no ?? '-'}`,
		`Judul: ${input.session.title ?? '-'}`,
		`Deskripsi: ${input.session.description ?? '-'}`,
		`Target URL: ${actualNavUrl || input.session.target_url || '-'}`,
		...(actualNavUrl && input.session.target_url && actualNavUrl !== input.session.target_url
			? [`Target URL Frontend Aktual: ${actualNavUrl}`, `Target URL Sesi: ${input.session.target_url}`]
			: []),
		`Hasil: ${input.session.result ?? '-'}`,
		`Actual result: ${input.session.actual_result ?? '-'}`,
		'',
		'## Ringkasan Aktivitas',
		`Total event: ${counts.total} (action: ${counts.actions}, console: ${counts.console}, network: ${counts.network}, artifact: ${counts.artifacts})`,
		'',
		'## Langkah Tester',
		renderSteps(input.events),
		'',
		'## Checkpoint Tester',
		checkpointLines,
		'',
		'## Anomali Console',
		anomalies.consoleAnomalies.length > 0 ? anomalies.consoleAnomalies.join('\n') : '(tidak ada)',
		'',
		'## Anomali Network',
		anomalies.networkAnomalies.length > 0 ? anomalies.networkAnomalies.join('\n') : '(tidak ada)'
	].join('\n');
};
