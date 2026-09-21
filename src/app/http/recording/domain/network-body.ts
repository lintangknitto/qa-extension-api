/**
 * Aturan penyimpanan body network: hanya tipe teks/JSON yang disimpan,
 * dibatasi ukuran, dan ditandai `truncated` bila dipotong.
 */
export interface INetworkBodyRules {
	maxBytes: number;
}

export interface INetworkBodyResult {
	stored: boolean;
	storedBody: string | null;
	truncated: boolean;
	reason: string | null;
	originalBytes: number;
}

const STORABLE_CONTENT_TYPES = [
	'application/json',
	'application/ld+json',
	'application/xml',
	'application/x-www-form-urlencoded',
	'application/graphql',
	'application/javascript',
	'application/x-javascript',
	'text/plain',
	'text/html',
	'text/css',
	'text/xml',
	'text/csv',
	'text/javascript'
];

const BINARY_CONTENT_PREFIXES = ['image/', 'video/', 'audio/', 'font/'];
const BINARY_CONTENT_TYPES = [
	'application/octet-stream',
	'application/pdf',
	'application/zip',
	'application/gzip',
	'application/x-protobuf',
	'application/wasm',
	'multipart/form-data'
];
const STREAMING_CONTENT_TYPES = ['text/event-stream'];

const baseContentType = (contentType: string | null | undefined): string =>
	(contentType ?? '').split(';')[0].trim().toLowerCase();

export const isStorableContentType = (contentType: string | null | undefined): boolean => {
	const base = baseContentType(contentType);
	if (!base) return false;
	return STORABLE_CONTENT_TYPES.some((allowed) => base === allowed || base.endsWith(`+${allowed.split('/')[1]}`));
};

export const isBinaryContentType = (contentType: string | null | undefined): boolean => {
	const base = baseContentType(contentType);
	if (!base) return false;
	return (
		BINARY_CONTENT_PREFIXES.some((prefix) => base.startsWith(prefix)) ||
		BINARY_CONTENT_TYPES.includes(base)
	);
};

export const isStreamingContentType = (contentType: string | null | undefined): boolean =>
	STREAMING_CONTENT_TYPES.includes(baseContentType(contentType));

export const byteLength = (value: string): number => Buffer.byteLength(value, 'utf8');

export const applyNetworkBodyRules = (
	input: { contentType?: string | null; body?: string | null },
	rules: INetworkBodyRules
): INetworkBodyResult => {
	const body = input.body ?? null;
	const originalBytes = body === null ? 0 : byteLength(body);

	if (body === null || body === '')
		return { stored: false, storedBody: null, truncated: false, reason: 'no_body', originalBytes };

	if (isStreamingContentType(input.contentType))
		return { stored: false, storedBody: null, truncated: false, reason: 'streaming_content_type', originalBytes };

	if (isBinaryContentType(input.contentType))
		return { stored: false, storedBody: null, truncated: false, reason: 'binary_content_type', originalBytes };

	if (!isStorableContentType(input.contentType))
		return { stored: false, storedBody: null, truncated: false, reason: 'content_type_not_allowlisted', originalBytes };

	if (originalBytes > rules.maxBytes) {
		return {
			stored: true,
			storedBody: Buffer.from(body, 'utf8').subarray(0, rules.maxBytes).toString('utf8'),
			truncated: true,
			reason: 'body_exceeds_limit',
			originalBytes
		};
	}

	return { stored: true, storedBody: body, truncated: false, reason: null, originalBytes };
};

const readContentType = (record: Record<string, unknown>): string | null => {
	if (typeof record.content_type === 'string') return record.content_type;
	if (typeof record.contentType === 'string') return record.contentType;
	return null;
};

/**
 * Menerapkan aturan body pada payload event `network` (request & response)
 * sehingga batas ukuran dan allowlist tipe benar-benar ditegakkan di backend.
 */
export const normalizeNetworkPayloadBodies = (
	payload: Record<string, unknown>,
	rules: INetworkBodyRules
): Record<string, unknown> => {
	const output: Record<string, unknown> = { ...payload };

	for (const side of ['request', 'response'] as const) {
		const part = output[side];
		if (!part || typeof part !== 'object' || Array.isArray(part)) continue;

		const record = { ...(part as Record<string, unknown>) };
		const body = typeof record.body === 'string' ? record.body : null;
		const result = applyNetworkBodyRules({ contentType: readContentType(record), body }, rules);

		record.body = result.storedBody;
		record.body_stored = result.stored;
		record.body_truncated = result.truncated;
		record.body_reason = result.reason;
		record.body_bytes = result.originalBytes;

		output[side] = record;
	}

	return output;
};
