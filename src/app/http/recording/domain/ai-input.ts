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

const renderSteps = (events: IAiInputEvent[]): string => {
	const actions = events.filter((event) => event.type === 'action').slice(0, 200);
	if (actions.length === 0) return '(tidak ada action tercatat)';
	return actions
		.map((event) => {
			const actionKind = asString(event.payload.action) || asString(event.payload.type) || 'action';
			const target = asString(event.payload.selector) || asString(event.payload.locator) || event.url || '';
			const label = asString(event.payload.label);
			return `${event.sequence}. ${actionKind} ${target}${label ? ` (${label})` : ''}`.trim();
		})
		.join('\n');
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

	return [
		'## Identitas Test Case',
		`Nomor: ${input.session.test_case_no ?? '-'}`,
		`Judul: ${input.session.title ?? '-'}`,
		`Deskripsi: ${input.session.description ?? '-'}`,
		`Target URL: ${input.session.target_url ?? '-'}`,
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
