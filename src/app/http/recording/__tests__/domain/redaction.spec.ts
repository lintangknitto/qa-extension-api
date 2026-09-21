import {
	MAX_REDACTION_DEPTH,
	REDACTED,
	TRUNCATED_DEPTH,
	isSensitiveElementDescriptor,
	redactDeep,
	redactEventPayload,
	redactHeaders,
	redactNetworkPayloadBodies,
	redactSensitiveInputValues,
	redactStringValue,
	redactUrl
} from '../../domain/redaction';

describe('redaction', () => {
	describe('redactHeaders', () => {
		it('menyamarkan authorization dan cookie', () => {
			const result = redactHeaders({
				Authorization: 'Bearer rahasia-sekali',
				Cookie: 'session=abc123',
				'Content-Type': 'application/json'
			});

			expect(result.Authorization).toBe(REDACTED);
			expect(result.Cookie).toBe(REDACTED);
			expect(result['Content-Type']).toBe('application/json');
		});

		it('mengembalikan object kosong untuk input bukan object', () => {
			expect(redactHeaders(null)).toEqual({});
			expect(redactHeaders('bukan object')).toEqual({});
		});
	});

	describe('redactUrl', () => {
		it('menyamarkan nilai query param sensitif tetapi mempertahankan nama param', () => {
			const result = redactUrl('https://api.knitto.test/v1/orders?token=abc&page=2');
			expect(result).toContain(`token=${REDACTED}`);
			expect(result).toContain('page=2');
			expect(result).not.toContain('abc');
		});

		it('tetap aman untuk URL yang tidak valid', () => {
			expect(redactUrl('bukan-url?token=abc')).not.toContain('abc');
		});
	});

	describe('redactStringValue', () => {
		it('menyamarkan email', () => {
			expect(redactStringValue('hubungi budi@knitto.co.id sekarang')).toBe(
				`hubungi ${REDACTED} sekarang`
			);
		});

		it('menyamarkan deretan angka mirip kartu', () => {
			expect(redactStringValue('kartu 4111 1111 1111 1111 dipakai')).toContain(REDACTED);
		});

		it('menyamarkan token yang tertanam di teks bebas', () => {
			expect(redactStringValue('pakai tok_live_9f8e7d6c5b4a ya')).toBe(`pakai ${REDACTED} ya`);
		});
	});

	describe('redactDeep / redactEventPayload', () => {
		it('menyamarkan field sensitif bersarang', () => {
			const result = redactEventPayload({
				request: {
					headers: { authorization: 'Bearer x' },
					body: { username: 'budi', password: 'P@ssw0rd!' }
				},
				safe: 1
			}) as any;

			expect(result.request.headers.authorization).toBe(REDACTED);
			expect(result.request.body.password).toBe(REDACTED);
			expect(result.request.body.username).toBe('budi');
			expect(result.safe).toBe(1);
		});

		it('membatasi kedalaman rekursi', () => {
			let nested: Record<string, unknown> = { value: 'dalam' };
			for (let i = 0; i < MAX_REDACTION_DEPTH + 3; i++) nested = { child: nested };

			const result = JSON.stringify(redactDeep(nested));
			expect(result).toContain(TRUNCATED_DEPTH);
		});

		it('mengenali descriptor elemen sensitif lewat name/type/ariaLabel', () => {
			expect(isSensitiveElementDescriptor({ name: 'password' })).toBe(true);
			expect(isSensitiveElementDescriptor({ type: 'password' })).toBe(true);
			expect(isSensitiveElementDescriptor({ ariaLabel: 'One Time Password (OTP)' })).toBe(true);
			expect(isSensitiveElementDescriptor({ name: 'email' })).toBe(false);
			expect(isSensitiveElementDescriptor(null)).toBe(false);
			expect(isSensitiveElementDescriptor('bukan-object')).toBe(false);
		});

		it('memastikan nilai form sensitif di key generik ikut terredaksi (F1)', () => {
			const payload = {
				action: 'change',
				value: 'P@ssw0rd-Rahasia',
				value_redacted: false,
				element: { tagName: 'INPUT', name: 'password', ariaLabel: 'Password' }
			};

			const result = redactSensitiveInputValues(redactEventPayload(payload)) as any;
			const serialized = JSON.stringify(result);

			expect(result.value).toBe(REDACTED);
			expect(result.value_redacted).toBe(true);
			expect(serialized).not.toContain('P@ssw0rd-Rahasia');
		});

		it('tidak mengubah payload saat descriptor tidak sensitif', () => {
			const payload = { action: 'change', value: 'teks biasa', element: { tagName: 'INPUT', name: 'email' } };
			const result = redactSensitiveInputValues(payload as Record<string, unknown>) as any;

			expect(result.value).toBe('teks biasa');
			expect(result.value_redacted).toBeUndefined();
		});

		it('menyamarkan query param sensitif pada URL yang bersarang di payload (G2)', () => {
			const result = redactEventPayload({
				page: 'cb',
				url: 'https://api.knitto.test/callback?access_token=rahasia123&page=1'
			}) as any;

			expect(result.url).toContain(`access_token=${REDACTED}`);
			expect(result.url).not.toContain('rahasia123');
			expect(result.url).toContain('page=1');
		});

		it('memastikan secret pada fixture tidak muncul di hasil', () => {
			const fixtureSecret = 'super-secret-token-12345';
			const payload = {
				action: 'fill',
				value: 'user@example.com',
				headers: { authorization: `Bearer ${fixtureSecret}` },
				meta: { refresh_token: fixtureSecret }
			};

			const serialized = JSON.stringify(redactEventPayload(payload));
			expect(serialized).not.toContain(fixtureSecret);
			expect(serialized).not.toContain('user@example.com');
		});
	});

	describe('redactNetworkPayloadBodies (G1)', () => {
		it('meredaksi key sensitif di body JSON', () => {
			const result = redactNetworkPayloadBodies({
				request: {
					content_type: 'application/json',
					body: '{"username":"budi","password":"hunter2","nested":{"token":"abc123"}}'
				}
			}) as any;

			const body = JSON.parse(result.request.body);
			expect(body.username).toBe('budi');
			expect(body.password).toBe(REDACTED);
			expect(body.nested.token).toBe(REDACTED);
			expect(result.request.body).not.toContain('hunter2');
			expect(result.request.body).not.toContain('abc123');
		});

		it('meredaksi field sensitif di body urlencoded', () => {
			const result = redactNetworkPayloadBodies({
				request: { content_type: 'application/x-www-form-urlencoded', body: 'user=budi&password=hunter2' }
			}) as any;

			expect(decodeURIComponent(result.request.body)).toContain(`password=${REDACTED}`);
			expect(result.request.body).not.toContain('hunter2');
		});

		it('redactEventPayload ikut menyamarkan token di query URL bersarang', () => {
			const payload = {
				request: { url: 'https://api.knitto.test/cb?token=abc123&x=1' }
			};
			const serialized = JSON.stringify(redactEventPayload(payload));
			expect(serialized).not.toContain('abc123');
		});
	});
});
