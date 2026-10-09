import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import { buildPublicObjectUrl } from '@/libs/config/minioClient';
import { ARTIFACT_STATUS, assertArtifactBelongsToSession, assertArtifactExists } from '../domain/artifact';
import * as artifactQueries from '../queries/artifact.queries';
import * as artifactRepo from '../repo/artifact.repo';
import * as sessionQueries from '../../session/queries/session.queries';
import * as sessionDomain from '../../session/domain/session.domain';
import type { TLinkTestDataFilesValidation } from '../artifact.request';

const TEST_DATA_KIND = 'test_data_file';

export interface ITestDataFile {
	id_artifact: number;
	file_name: string;
	content_type: string | null;
	size_bytes: number;
	sequence: number | null;
	download_url: string;
}

/**
 * File test data sesi untuk replay, satu per nama file (artifact terbaru menang, sehingga file
 * pengganti menimpa rekaman awal). Replay mencocokkan langkah `setInputFiles` berdasarkan nama file.
 */
export const listTestDataFiles = (artifacts: Entity.IQaRecordingArtifact[]): ITestDataFile[] => {
	const latest = new Map<string, Entity.IQaRecordingArtifact>();
	for (const artifact of artifacts) {
		if (artifact.kind !== TEST_DATA_KIND || artifact.status !== ARTIFACT_STATUS.UPLOADED || !artifact.file_name) continue;
		const current = latest.get(artifact.file_name);
		if (!current || Number(artifact.id_artifact) > Number(current.id_artifact)) latest.set(artifact.file_name, artifact);
	}
	return [...latest.values()]
		.sort((a, b) => Number(a.id_artifact) - Number(b.id_artifact))
		.map((artifact) => ({
			id_artifact: Number(artifact.id_artifact),
			file_name: String(artifact.file_name),
			content_type: artifact.content_type ?? null,
			size_bytes: Number(artifact.size_bytes ?? 0),
			sequence: artifact.sequence !== undefined && artifact.sequence !== null ? Number(artifact.sequence) : null,
			download_url: buildPublicObjectUrl(String(artifact.object_key))
		}));
};

const loadAccessibleSession = async (ctx: { idSession: number; userId: number; userLevel: string | undefined }) => {
	const session = sessionDomain.assertSessionExists(await sessionQueries.findSessionById(ctx.idSession));
	sessionDomain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);
	return session;
};

export const listTestDataFilesUseCase = async (ctx: { idSession: number; userId: number; userLevel: string | undefined }) => {
	await loadAccessibleSession(ctx);
	return listTestDataFiles(await artifactQueries.listArtifactsBySession(ctx.idSession));
};

/**
 * Kaitkan file pengganti (artifact `test_data_file` yang sudah terunggah) ke langkah upload:
 * `file_name` = nama file yang diharapkan langkah tersebut, `sequence` opsional.
 */
export const linkTestDataFilesUseCase = async (ctx: {
	idSession: number;
	userId: number;
	userLevel: string | undefined;
	input: TLinkTestDataFilesValidation;
}) => {
	await loadAccessibleSession(ctx);

	const artifacts = await Promise.all(ctx.input.files.map((file) => artifactQueries.findArtifactById(file.id_artifact)));
	artifacts.forEach((found) => {
		const artifact = assertArtifactExists(found);
		assertArtifactBelongsToSession(artifact, ctx.idSession);
		if (artifact.kind !== TEST_DATA_KIND)
			throw new InvalidParameterException('Artifact bukan file test data.');
		if (artifact.status !== ARTIFACT_STATUS.UPLOADED)
			throw new InvalidParameterException('File test data belum selesai diupload.');
	});

	for (const file of ctx.input.files) {
		await artifactRepo.linkTestDataFile(file.id_artifact, { fileName: file.file_name, sequence: file.sequence ?? null });
	}

	return listTestDataFiles(await artifactQueries.listArtifactsBySession(ctx.idSession));
};
