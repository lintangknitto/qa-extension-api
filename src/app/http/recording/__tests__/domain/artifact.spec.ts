import {
	InvalidParameterException,
	NotFoundException
} from '@knittotextile/knitto-core-backend/dist/CoreException';
import {
	assertAllowedContentType,
	assertArtifactBelongsToSession,
	assertArtifactExists,
	assertSizeAllowed,
	assertSupportedArtifactKind,
	assertUploadedObjectAllowed,
	buildArtifactObjectKey,
	extensionForContentType,
	isAllowedContentType,
	toArtifactResponse
} from '../../domain/artifact';

const ALLOWLIST = ['image/png', 'application/json'];

describe('artifact.domain', () => {
	describe('assertSupportedArtifactKind', () => {
		it('menerima kind yang dikenal', () => {
			expect(assertSupportedArtifactKind('screenshot')).toBe('screenshot');
		});

		it('menolak kind yang tidak dikenal', () => {
			expect(() => assertSupportedArtifactKind('random')).toThrow(InvalidParameterException);
		});
	});

	describe('isAllowedContentType / assertAllowedContentType', () => {
		it('mengabaikan parameter charset', () => {
			expect(isAllowedContentType('image/png; charset=binary', ALLOWLIST)).toBe(true);
			expect(isAllowedContentType('application/json; charset=utf-8', ALLOWLIST)).toBe(true);
		});

		it('menolak content type di luar allowlist', () => {
			expect(isAllowedContentType('text/html', ALLOWLIST)).toBe(false);
			expect(() => assertAllowedContentType('text/html', ALLOWLIST)).toThrow(InvalidParameterException);
		});
	});

	describe('assertSizeAllowed', () => {
		it('menerima ukuran dalam batas', () => {
			expect(() => assertSizeAllowed(1024, 10 * 1024)).not.toThrow();
		});

		it('menolak ukuran melebihi batas atau tidak valid', () => {
			expect(() => assertSizeAllowed(20 * 1024, 10 * 1024)).toThrow(InvalidParameterException);
			expect(() => assertSizeAllowed(0, 1024)).toThrow(InvalidParameterException);
			expect(() => assertSizeAllowed(1.5, 1024)).toThrow(InvalidParameterException);
		});
	});

	describe('extensionForContentType', () => {
		it('memetakan content type ke ekstensi', () => {
			expect(extensionForContentType('image/png')).toBe('png');
			expect(extensionForContentType('image/jpeg')).toBe('jpg');
			expect(extensionForContentType('image/webp')).toBe('webp');
			expect(extensionForContentType('application/json')).toBe('json');
			expect(extensionForContentType('application/x-custom')).toBe('bin');
		});
	});

	describe('buildArtifactObjectKey', () => {
		it('membuat key terikat session dengan ekstensi sesuai content type', () => {
			const key = buildArtifactObjectKey({ idSession: 12, kind: 'screenshot', contentType: 'image/png' });
			expect(key.startsWith('sessions/12/screenshot/')).toBe(true);
			expect(key.endsWith('.png')).toBe(true);
		});

		it('menghasilkan key unik', () => {
			const first = buildArtifactObjectKey({ idSession: 1, kind: 'other', contentType: 'text/plain' });
			const second = buildArtifactObjectKey({ idSession: 1, kind: 'other', contentType: 'text/plain' });
			expect(first).not.toBe(second);
		});
	});

	describe('assertArtifactBelongsToSession', () => {
		it('tidak melempar bila session cocok', () => {
			expect(() => assertArtifactBelongsToSession({ id_session: 5 }, 5)).not.toThrow();
		});

		it('melempar NotFoundException bila session berbeda', () => {
			expect(() => assertArtifactBelongsToSession({ id_session: 5 }, 6)).toThrow(NotFoundException);
		});
	});

	describe('assertUploadedObjectAllowed (G4)', () => {
		const rules = { maxBytes: 10 * 1024, allowedContentTypes: ALLOWLIST };

		it('menerima objek yang sesuai ukuran dan content type', () => {
			expect(() =>
				assertUploadedObjectAllowed({ size: 1024, contentType: 'image/png' }, rules)
			).not.toThrow();
		});

		it('menolak objek yang ukurannya melebihi batas', () => {
			expect(() =>
				assertUploadedObjectAllowed({ size: 20 * 1024, contentType: 'image/png' }, rules)
			).toThrow(InvalidParameterException);
		});

		it('menolak objek dengan content type di luar allowlist', () => {
			expect(() =>
				assertUploadedObjectAllowed({ size: 1024, contentType: 'text/html' }, rules)
			).toThrow(InvalidParameterException);
		});
	});

	describe('assertArtifactExists', () => {
		it('melempar NotFoundException untuk null', () => {
			expect(() => assertArtifactExists(null)).toThrow(NotFoundException);
		});
	});

	describe('toArtifactResponse', () => {
		it('menormalkan ukuran menjadi angka', () => {
			expect(toArtifactResponse({ id_artifact: 1, size_bytes: undefined }).size_bytes).toBe(0);
			expect(toArtifactResponse({ id_artifact: 1, size_bytes: 2048 }).size_bytes).toBe(2048);
		});
	});
});
