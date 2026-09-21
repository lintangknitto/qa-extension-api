import { MySqlResultSetHeader } from '@knittotextile/knitto-mysql/dist/libs/MySqlConnector';
import mysqlConnection from '@/libs/config/mysqlConnection';

export const insertArtifact = async (fields: {
	idSession: number;
	kind: string;
	objectKey: string;
	contentType: string;
	sizeBytes: number;
	sequence?: number | null;
}): Promise<number> => {
	const result = await mysqlConnection.raw<MySqlResultSetHeader>(
		`INSERT INTO qa_recording_artifact (id_session, kind, object_key, content_type, size_bytes, sequence, status)
		 VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
		[
			fields.idSession,
			fields.kind,
			fields.objectKey,
			fields.contentType,
			fields.sizeBytes,
			fields.sequence ?? null
		]
	);
	return Number(result.insertId);
};

export const markArtifactUploaded = async (
	idArtifact: number,
	fields: { sizeBytes?: number; checksumSha256?: string | null }
): Promise<void> => {
	const assignments = ["status = 'uploaded'"];
	const params: unknown[] = [];

	if (fields.sizeBytes !== undefined) {
		assignments.push('size_bytes = ?');
		params.push(fields.sizeBytes);
	}
	if (fields.checksumSha256 !== undefined && fields.checksumSha256 !== null) {
		assignments.push('checksum_sha256 = ?');
		params.push(fields.checksumSha256);
	}

	params.push(idArtifact);
	await mysqlConnection.raw<MySqlResultSetHeader>(
		`UPDATE qa_recording_artifact SET ${assignments.join(', ')} WHERE id_artifact = ?`,
		params
	);
};
