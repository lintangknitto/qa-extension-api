import {
	applyNetworkBodyRules,
	byteLength,
	isBinaryContentType,
	isStorableContentType,
	isStreamingContentType,
	normalizeNetworkPayloadBodies
} from '../../domain/network-body';

const RULES = { maxBytes: 32 };

describe('network-body', () => {
	describe('klasifikasi content type', () => {
		it('mengenali tipe yang boleh disimpan', () => {
			expect(isStorableContentType('application/json; charset=utf-8')).toBe(true);
			expect(isStorableContentType('text/plain')).toBe(true);
		});

		it('mengenali tipe binary dan streaming', () => {
			expect(isBinaryContentType('image/png')).toBe(true);
			expect(isBinaryContentType('application/octet-stream')).toBe(true);
			expect(isStreamingContentType('text/event-stream')).toBe(true);
			expect(isStorableContentType('image/png')).toBe(false);
		});
	});

	describe('applyNetworkBodyRules', () => {
		it('menyimpan body JSON yang masih dalam batas', () => {
			const result = applyNetworkBodyRules({ contentType: 'application/json', body: '{"a":1}' }, RULES);
			expect(result.stored).toBe(true);
			expect(result.truncated).toBe(false);
			expect(result.storedBody).toBe('{"a":1}');
		});

		it('memotong body yang melebihi batas dan menandai truncated', () => {
			const body = 'x'.repeat(100);
			const result = applyNetworkBodyRules({ contentType: 'application/json', body }, RULES);

			expect(result.stored).toBe(true);
			expect(result.truncated).toBe(true);
			expect(byteLength(result.storedBody as string)).toBeLessThanOrEqual(RULES.maxBytes);
			expect(result.originalBytes).toBe(100);
		});

		it('menyimpan metadata saja untuk image', () => {
			const result = applyNetworkBodyRules({ contentType: 'image/png', body: 'binary-data' }, RULES);
			expect(result.stored).toBe(false);
			expect(result.storedBody).toBeNull();
			expect(result.reason).toBe('binary_content_type');
		});

		it('menyimpan metadata saja untuk streaming', () => {
			const result = applyNetworkBodyRules({ contentType: 'text/event-stream', body: 'data: x' }, RULES);
			expect(result.stored).toBe(false);
			expect(result.reason).toBe('streaming_content_type');
		});

		it('menyimpan metadata saja untuk content type di luar allowlist', () => {
			const result = applyNetworkBodyRules({ contentType: 'application/x-custom', body: 'x' }, RULES);
			expect(result.stored).toBe(false);
			expect(result.reason).toBe('content_type_not_allowlisted');
		});

		it('menandai tidak ada body', () => {
			const result = applyNetworkBodyRules({ contentType: 'application/json', body: null }, RULES);
			expect(result.stored).toBe(false);
			expect(result.reason).toBe('no_body');
		});
	});

	describe('normalizeNetworkPayloadBodies', () => {
		it('menerapkan aturan pada request dan response', () => {
			const result = normalizeNetworkPayloadBodies(
				{
					method: 'POST',
					request: { content_type: 'application/json', body: '{"a":1}' },
					response: { content_type: 'image/png', body: 'binary' }
				},
				RULES
			) as any;

			expect(result.request.body_stored).toBe(true);
			expect(result.request.body_truncated).toBe(false);
			expect(result.response.body_stored).toBe(false);
			expect(result.response.body_reason).toBe('binary_content_type');
			expect(result.response.body).toBeNull();
			expect(result.method).toBe('POST');
		});

		it('menandai truncated untuk body yang dipotong', () => {
			const result = normalizeNetworkPayloadBodies(
				{ response: { content_type: 'application/json', body: 'x'.repeat(100) } },
				RULES
			) as any;

			expect(result.response.body_truncated).toBe(true);
			expect(result.response.body_bytes).toBe(100);
		});

		it('mengabaikan payload tanpa request/response object', () => {
			const result = normalizeNetworkPayloadBodies({ method: 'GET' }, RULES);
			expect(result).toEqual({ method: 'GET' });
		});
	});
});
