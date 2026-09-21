import {
	InvalidParameterException,
	NotAuthorizationException,
	NotFoundException,
	RequestAbortedByClient
} from '@knittotextile/knitto-core-backend/dist/CoreException';

/**
 * Exception yang pesannya memang ditujukan untuk client. Error lain (DB,
 * MinIO, provider AI, dsb.) diganti pesan generik supaya detail internal tidak
 * bocor lewat ack Socket.IO.
 */
const CLIENT_SAFE_EXCEPTIONS = [
	InvalidParameterException,
	NotAuthorizationException,
	NotFoundException,
	RequestAbortedByClient
];

export const SAFE_SOCKET_ERROR_MESSAGE =
	'Terjadi kesalahan saat memproses permintaan recording. Silakan coba lagi.';

export const toSafeSocketErrorMessage = (error: unknown): string => {
	const safe = CLIENT_SAFE_EXCEPTIONS.some((type) => error instanceof type);
	if (safe && error instanceof Error && error.message) return error.message;
	return SAFE_SOCKET_ERROR_MESSAGE;
};
