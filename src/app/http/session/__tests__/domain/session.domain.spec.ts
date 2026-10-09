import {
	InvalidParameterException,
	NotAuthorizationException,
	NotFoundException
} from '@knittotextile/knitto-core-backend/dist/CoreException';
import * as domain from '../../domain/session.domain';

const ADMIN_LEVELS = ['ADMIN', 'QA', 'SUPERADMIN'];

const session = (overrides: Partial<Entity.IQaRecordingSession> = {}): Entity.IQaRecordingSession => ({
	id_session: 1,
	id_project: 10,
	owner_user_id: 7,
	status: domain.SESSION_STATUS.RECORDING,
	...overrides
});

describe('session.domain', () => {
	describe('assertValidSessionResult', () => {
		it('menerima PASS, FAIL, dan BLOCKED', () => {
			expect(domain.assertValidSessionResult('PASS')).toBe('PASS');
			expect(domain.assertValidSessionResult('FAIL')).toBe('FAIL');
			expect(domain.assertValidSessionResult('BLOCKED')).toBe('BLOCKED');
		});

		it('melempar untuk hasil di luar daftar', () => {
			expect(() => domain.assertValidSessionResult('SKIPPED')).toThrow(InvalidParameterException);
		});
	});

	describe('assertSessionIsRecording', () => {
		it('tidak melempar saat status recording', () => {
			expect(() => domain.assertSessionIsRecording(session())).not.toThrow();
		});

		it('melempar saat session sudah selesai', () => {
			expect(() => domain.assertSessionIsRecording(session({ status: 'completed' }))).toThrow(
				InvalidParameterException
			);
		});
	});

	describe('assertSessionExists', () => {
		it('melempar NotFoundException untuk null', () => {
			expect(() => domain.assertSessionExists(null)).toThrow(NotFoundException);
		});
	});

	describe('canAccessSession', () => {
		it('mengizinkan owner', () => {
			expect(domain.canAccessSession(session(), 7, 'IMPLEMENTOR', ADMIN_LEVELS)).toBe(true);
		});

		it('mengizinkan QA/admin meski bukan owner', () => {
			expect(domain.canAccessSession(session(), 99, 'QA', ADMIN_LEVELS)).toBe(true);
		});

		it('menolak user lain yang bukan admin', () => {
			expect(domain.canAccessSession(session(), 99, 'IMPLEMENTOR', ADMIN_LEVELS)).toBe(false);
		});
	});

	describe('assertCanAccessSession', () => {
		it('melempar NotAuthorizationException untuk user lain', () => {
			expect(() => domain.assertCanAccessSession(session(), 99, 'IMPLEMENTOR', ADMIN_LEVELS)).toThrow(
				NotAuthorizationException
			);
		});
	});

	describe('toSessionResponse', () => {
		it('menormalkan last_sequence menjadi angka', () => {
			expect(domain.toSessionResponse(session({ last_sequence: undefined })).last_sequence).toBe(0);
			expect(domain.toSessionResponse(session({ last_sequence: 42 })).last_sequence).toBe(42);
		});

		it('mengisi field kosong dengan null', () => {
			const response = domain.toSessionResponse({ id_session: 1 });
			expect(response.title).toBeNull();
			expect(response.result).toBeNull();
			expect(response.ended_at).toBeNull();
		});

		it('menghitung video_url publik dari video_object_key, bukan dari video_url presigned lama', () => {
			const response = domain.toSessionResponse(
				session({ video_url: 'http://127.0.0.1:9000/b/x?X-Amz-Signature=old', video_object_key: 'sessions/1/video/a.webm' })
			);
			expect(response.video_url).toMatch(/\/qa-recording-artifacts\/sessions\/1\/video\/a\.webm$/);
			expect(response.video_url).not.toContain('X-Amz');
			expect(domain.toSessionResponse(session({ video_url: 'http://old', video_object_key: null })).video_url).toBeNull();
		});
	});

	describe('toCheckpointResponse', () => {
		it('memetakan field checkpoint', () => {
			const response = domain.toCheckpointResponse({
				id_checkpoint: 3,
				id_session: 1,
				note: 'cek login',
				sequence: 12
			});
			expect(response).toEqual({
				id_checkpoint: 3,
				id_session: 1,
				note: 'cek login',
				sequence: 12,
				id_artifact: null,
				created_by_user_id: null,
				created_at: null
			});
		});
	});
});
