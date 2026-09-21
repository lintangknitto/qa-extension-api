import {
	GeneralException,
	InvalidParameterException,
	NotFoundException
} from '@knittotextile/knitto-core-backend/dist/CoreException';
import { SAFE_SOCKET_ERROR_MESSAGE, toSafeSocketErrorMessage } from '../socket-error';

describe('toSafeSocketErrorMessage (G8)', () => {
	it('meneruskan pesan exception yang aman untuk client', () => {
		expect(toSafeSocketErrorMessage(new InvalidParameterException('Sequence tidak valid.'))).toBe(
			'Sequence tidak valid.'
		);
		expect(toSafeSocketErrorMessage(new NotFoundException('Session tidak ditemukan.'))).toBe(
			'Session tidak ditemukan.'
		);
	});

	it('menyamarkan error internal (DB) menjadi pesan generik', () => {
		const message = toSafeSocketErrorMessage(
			new Error('ER_DUP_ENTRY: Duplicate entry for key uq_qa_session_active_owner')
		);

		expect(message).toBe(SAFE_SOCKET_ERROR_MESSAGE);
		expect(message).not.toContain('ER_DUP_ENTRY');
	});

	it('menyamarkan GeneralException (error infra seperti MinIO/OpenAI)', () => {
		expect(toSafeSocketErrorMessage(new GeneralException('koneksi minio gagal'))).toBe(
			SAFE_SOCKET_ERROR_MESSAGE
		);
	});
});
