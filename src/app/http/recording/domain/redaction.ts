/**
 * Redaksi data sensitif. Dijalankan sebelum event dipersist dan sebelum
 * dikirim ke AI, sehingga keamanan tidak bergantung pada prompt instruction.
 */
export const REDACTED = '[REDACTED]';
export const TRUNCATED_DEPTH = '[TRUNCATED_DEPTH]';
export const MAX_REDACTION_DEPTH = 8;

const SENSITIVE_KEY_PATTERN =
	/(authorization|cookie|password|passwd|pwd|secret|token|api[-_]?key|access[-_]?key|credential|csrf|xsrf|otp|\bpin\b|session[-_]?id)/i;

const SENSITIVE_URL_PARAMS = [
	'token',
	'access_token',
	'refresh_token',
	'api_key',
	'apikey',
	'key',
	'secret',
	'password',
	'signature',
	'sig',
	'session',
	'sessionid'
];

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CARD_LIKE_PATTERN = /\b(?:\d[ -]?){13,19}\b/g;
// Prefix kredensial umum + nilai panjang, supaya token yang tertanam di teks
// bebas (mis. catatan tester) ikut disamarkan.
const TOKEN_LIKE_PATTERN = /\b(?:sk|pk|tok|ghp|gho|ghs|glpat|xox[baprs]|AKIA)[-_][A-Za-z0-9_-]{8,}\b/g;

export const isSensitiveKey = (key: string): boolean => SENSITIVE_KEY_PATTERN.test(key);

export const redactStringValue = (value: string): string =>
	value
		.replace(EMAIL_PATTERN, REDACTED)
		.replace(CARD_LIKE_PATTERN, REDACTED)
		.replace(TOKEN_LIKE_PATTERN, REDACTED);

const SENSITIVE_PARAM_REGEX = new RegExp(
	`([?&](?:${SENSITIVE_URL_PARAMS.join('|')})=)([^&#]*)`,
	'gi'
);

/**
 * Menyamarkan nilai query param sensitif tetapi mempertahankan nama param agar
 * struktur URL tetap terbaca saat debugging. Berlaku untuk URL absolut maupun
 * relatif karena tidak bergantung pada parsing URL.
 */
export const redactUrl = (url: string): string =>
	redactStringValue(url.replace(SENSITIVE_PARAM_REGEX, `$1${REDACTED}`));

const PROTECTED_OUTPUT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const isProtectedOutputKey = (key: string): boolean => PROTECTED_OUTPUT_KEYS.has(key);

const redactObject = (value: Record<string, unknown>, depth: number): Record<string, unknown> => {
	const output: Record<string, unknown> = {};
	for (const [key, nested] of Object.entries(value)) {
		if (isProtectedOutputKey(key)) continue;
		output[key] = redactDeep(nested, key, depth + 1);
	}
	return output;
};

const redactNode = (value: unknown, keyHint: string, depth: number): unknown => {
	if (typeof value === 'string') return redactUrl(value);
	if (value === null || value === undefined) return value;
	if (typeof value === 'number' || typeof value === 'boolean') return value;

	if (Array.isArray(value)) return value.map((item) => redactDeep(item, keyHint, depth + 1));

	if (typeof value === 'object') return redactObject(value as Record<string, unknown>, depth);

	return value;
};

export const redactDeep = (value: unknown, keyHint = '', depth = 0): unknown => {
	if (depth > MAX_REDACTION_DEPTH) return TRUNCATED_DEPTH;
	if (keyHint && isSensitiveKey(keyHint)) return REDACTED;
	return redactNode(value, keyHint, depth);
};

export const redactHeaders = (headers: unknown): Record<string, unknown> => {
	if (!headers || typeof headers !== 'object') return {};
	return redactDeep(headers) as Record<string, unknown>;
};

export const redactEventPayload = (payload: Record<string, unknown>): Record<string, unknown> =>
	redactDeep(payload) as Record<string, unknown>;

const baseContentType = (contentType: string): string => contentType.split(';')[0].trim().toLowerCase();

const redactUrlEncodedBody = (body: string): string => {
	const params = new URLSearchParams(body);
	let changed = false;
	for (const key of [...params.keys()]) {
		const current = params.get(key);
		if (current === null) continue;
		if (isSensitiveKey(key)) {
			params.set(key, REDACTED);
			changed = true;
			continue;
		}
		const next = redactStringValue(current);
		if (next !== current) {
			params.set(key, next);
			changed = true;
		}
	}
	return changed ? params.toString() : body;
};

/**
 * Meredaksi isi body network yang disimpan sebagai string. Body JSON diparse
 * lebih dulu agar redaksi berbasis key (`password`, `token`, ...) benar-benar
 * berjalan; body urlencoded diperiksa per-field; selain itu fallback redaksi
 * string/URL.
 */
export const redactBodyForContentType = (
	body: string,
	contentType: string | null | undefined
): string => {
	const base = baseContentType(contentType ?? '');
	if (base === 'application/x-www-form-urlencoded') return redactUrlEncodedBody(body);
	if (base.includes('json') || base === 'application/graphql') {
		try {
			return JSON.stringify(redactDeep(JSON.parse(body)));
		} catch {
			return redactUrl(body);
		}
	}
	return redactUrl(body);
};

/**
 * Menerapkan redaksi isi body pada payload event `network` sebelum aturan
 * ukuran/allowlist dijalankan.
 */
export const redactNetworkPayloadBodies = (
	payload: Record<string, unknown>
): Record<string, unknown> => {
	const output: Record<string, unknown> = { ...payload };
	for (const side of ['request', 'response'] as const) {
		const part = output[side];
		if (!part || typeof part !== 'object' || Array.isArray(part)) continue;
		const record = { ...(part as Record<string, unknown>) };
		const body = typeof record.body === 'string' ? record.body : null;
		if (body !== null) {
			const contentType = (record.content_type ?? record.contentType) as string | null | undefined;
			record.body = redactBodyForContentType(body, contentType);
		}
		output[side] = record;
	}
	return output;
};

/**
 * Nilai form sensitif (mis. password) sering berada di key generik `value`,
 * sementara penandanya ada pada descriptor elemen. Redaksi berbasis nama key
 * saja tidak cukup, jadi descriptor diperiksa terpisah.
 */
const SENSITIVE_ELEMENT_FIELD_PATTERN =
	/(password|passwd|pwd|otp|\bpin\b|secret|token|credential|cvv|cvc|card[-_]?number)/i;

const ELEMENT_DESCRIPTOR_HINTS = ['name', 'type', 'autocomplete', 'id', 'ariaLabel', 'aria_label'];
const INPUT_VALUE_KEYS = ['value', 'input_value', 'text'];

export const isSensitiveElementDescriptor = (element: unknown): boolean => {
	if (!element || typeof element !== 'object' || Array.isArray(element)) return false;
	const record = element as Record<string, unknown>;

	return ELEMENT_DESCRIPTOR_HINTS.some((hint) => {
		const value = record[hint];
		return typeof value === 'string' && SENSITIVE_ELEMENT_FIELD_PATTERN.test(value);
	});
};

/**
 * Meredaksi field nilai pada payload aksi bila descriptor elemennya menandakan
 * input sensitif. Dijalankan setelah `redactEventPayload`.
 */
export const redactSensitiveInputValues = (
	payload: Record<string, unknown>
): Record<string, unknown> => {
	if (!isSensitiveElementDescriptor(payload.element)) return payload;

	const output: Record<string, unknown> = { ...payload };
	let changed = false;

	for (const key of INPUT_VALUE_KEYS) {
		const current = output[key];
		if (current !== undefined && current !== null && current !== REDACTED) {
			output[key] = REDACTED;
			changed = true;
		}
	}

	if (changed) output.value_redacted = true;
	return output;
};
