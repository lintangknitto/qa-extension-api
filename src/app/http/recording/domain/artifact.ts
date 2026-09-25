import { randomUUID } from 'crypto';
import {
	InvalidParameterException,
	NotFoundException
} from '@knittotextile/knitto-core-backend/dist/CoreException';

export const ARTIFACT_KINDS = ['screenshot', 'network_body', 'console', 'dom', 'video', 'other'] as const;
export type TArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const ARTIFACT_STATUS = {
	PENDING: 'pending',
	UPLOADED: 'uploaded'
} as const;

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'application/json': 'json',
	'text/plain': 'txt',
	'video/webm': 'webm'
};

export const isSupportedArtifactKind = (kind: string): kind is TArtifactKind =>
	(ARTIFACT_KINDS as readonly string[]).includes(kind);

export const assertSupportedArtifactKind = (kind: string): TArtifactKind => {
	if (!isSupportedArtifactKind(kind))
		throw new InvalidParameterException(`Jenis artifact tidak dikenal: ${String(kind)}.`);
	return kind;
};

export const baseContentType = (contentType: string): string =>
	contentType.split(';')[0].trim().toLowerCase();

export const isAllowedContentType = (contentType: string, allowlist: readonly string[]): boolean => {
	const base = baseContentType(contentType);
	return allowlist.map((item) => baseContentType(item)).includes(base);
};

export const assertAllowedContentType = (contentType: string, allowlist: readonly string[]): void => {
	if (!isAllowedContentType(contentType, allowlist))
		throw new InvalidParameterException(`Content type artifact tidak diizinkan: ${String(contentType)}.`);
};

export const assertSizeAllowed = (sizeBytes: number, maxBytes: number): void => {
	if (!Number.isInteger(sizeBytes) || sizeBytes <= 0)
		throw new InvalidParameterException('Ukuran artifact harus bilangan bulat > 0.');
	if (sizeBytes > maxBytes)
		throw new InvalidParameterException(`Ukuran artifact melebihi batas ${maxBytes} byte.`);
};

/**
 * Memastikan objek yang sudah diunggah ke storage benar-benar sesuai batas
 * ukuran dan allowlist content type — presigned URL sendiri tidak menegakkan
 * keduanya terhadap client.
 */
export const assertUploadedObjectAllowed = (
	object: { size: number; contentType?: string | null },
	rules: { maxBytes: number; allowedContentTypes: readonly string[] }
): void => {
	assertSizeAllowed(object.size, rules.maxBytes);
	assertAllowedContentType(object.contentType ?? '', rules.allowedContentTypes);
};

export const extensionForContentType = (contentType: string): string =>
	EXTENSION_BY_CONTENT_TYPE[baseContentType(contentType)] ?? 'bin';

/**
 * Object key terikat user/session agar artifact tidak bisa ditebak lintas sesi.
 */
export const buildArtifactObjectKey = (options: {
	idSession: number;
	kind: TArtifactKind;
	contentType: string;
}): string => {
	const extension = extensionForContentType(options.contentType);
	return `sessions/${options.idSession}/${options.kind}/${randomUUID()}.${extension}`;
};

export const assertObjectKeyBelongsToSession = (objectKey: string, idSession: number): void => {
	if (!objectKey.startsWith(`sessions/${idSession}/`))
		throw new InvalidParameterException('Object key artifact tidak sesuai dengan session.');
};

export const assertArtifactExists = (
	artifact: Entity.IQaRecordingArtifact | null
): Entity.IQaRecordingArtifact => {
	if (!artifact) throw new NotFoundException('Artifact tidak ditemukan.');
	return artifact;
};

export const assertArtifactBelongsToSession = (
	artifact: Entity.IQaRecordingArtifact,
	idSession: number
): void => {
	if (artifact.id_session !== idSession)
		throw new NotFoundException('Artifact tidak ditemukan pada session ini.');
};

export const toArtifactResponse = (artifact: Entity.IQaRecordingArtifact) => ({
	id_artifact: artifact.id_artifact ?? null,
	id_session: artifact.id_session ?? null,
	kind: artifact.kind ?? null,
	object_key: artifact.object_key ?? null,
	content_type: artifact.content_type ?? null,
	size_bytes: Number(artifact.size_bytes ?? 0),
	sequence: artifact.sequence ?? null,
	checksum_sha256: artifact.checksum_sha256 ?? null,
	status: artifact.status ?? null,
	created_at: artifact.created_at ?? null
});
