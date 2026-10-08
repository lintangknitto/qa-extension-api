import postgresConnection from '@/libs/config/postgresConnection';

export const insertArtifact = async (fields: {
	idSession: number;
	kind: string;
	objectKey: string;
	contentType: string;
	sizeBytes: number;
	sequence?: number | null;
}): Promise<number> => {
	const [row] = await postgresConnection.raw<Array<{ id_artifact: number | string }>>(
		`INSERT INTO recording_artifacts (id_session, kind, object_key, content_type, size_bytes, sequence, status, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, 'pending', CURRENT_TIMESTAMP)
		 RETURNING id_artifact`,
		[
			fields.idSession,
			fields.kind,
			fields.objectKey,
			fields.contentType,
			fields.sizeBytes,
			fields.sequence ?? null
		]
	);
	return Number(row?.id_artifact);
};

export const markArtifactUploaded = async (
	idArtifact: number,
	fields: { sizeBytes?: number; checksumSha256?: string | null }
): Promise<void> => {
	const assignments = ["status = 'uploaded'"];
	const params: unknown[] = [];

	if (fields.sizeBytes !== undefined) {
		params.push(fields.sizeBytes);
		assignments.push(`size_bytes = $${params.length}`);
	}
	if (fields.checksumSha256 !== undefined && fields.checksumSha256 !== null) {
		params.push(fields.checksumSha256);
		assignments.push(`checksum_sha256 = $${params.length}`);
	}

	params.push(idArtifact);
	await postgresConnection.raw(
		`UPDATE recording_artifacts SET ${assignments.join(', ')} WHERE id_artifact = $${params.length}`,
		params
	);
};
