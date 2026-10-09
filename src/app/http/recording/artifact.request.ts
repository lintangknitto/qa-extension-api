import {
	array,
	InferOutput,
	integer,
	maxLength,
	minLength,
	minValue,
	number,
	object,
	optional,
	pipe,
	picklist,
	regex,
	string,
	transform
} from 'valibot';
import { ERROR_VALIDATION_MSG } from '@/libs/config/errorMessage';
import { ARTIFACT_KINDS } from './domain/artifact';

const ID_MSG = 'ID tidak valid.';

const numericParam = (label: string) =>
	pipe(
		string(ERROR_VALIDATION_MSG.string(label)),
		regex(/^\d+$/, ID_MSG),
		transform((value) => Number(value)),
		integer(ID_MSG),
		minValue(1, ID_MSG)
	);

export const sessionParamValidation = object({
	id_session: numericParam('ID session')
});
export type TSessionParamValidation = InferOutput<typeof sessionParamValidation>;

export const sessionArtifactParamValidation = object({
	id_session: numericParam('ID session'),
	id_artifact: numericParam('ID artifact')
});
export type TSessionArtifactParamValidation = InferOutput<typeof sessionArtifactParamValidation>;

export const presignArtifactUploadValidation = object({
	kind: picklist([...ARTIFACT_KINDS], 'Jenis artifact tidak dikenal.'),
	content_type: pipe(
		string(ERROR_VALIDATION_MSG.string('Content type')),
		maxLength(150, ERROR_VALIDATION_MSG.maxLength('Content type', 150))
	),
	size_bytes: pipe(
		number(ERROR_VALIDATION_MSG.number('Ukuran artifact')),
		integer(ID_MSG),
		minValue(1, ID_MSG)
	),
	sequence: optional(pipe(number(ERROR_VALIDATION_MSG.number('Sequence')), integer(ID_MSG), minValue(0, ID_MSG))),
	file_name: optional(
		pipe(string(ERROR_VALIDATION_MSG.string('Nama file')), minLength(1, ERROR_VALIDATION_MSG.minLength('Nama file', 1)), maxLength(255, ERROR_VALIDATION_MSG.maxLength('Nama file', 255)))
	)
});
export type TPresignArtifactUploadValidation = InferOutput<typeof presignArtifactUploadValidation>;

export const completeArtifactUploadValidation = object({
	size_bytes: optional(pipe(number(ERROR_VALIDATION_MSG.number('Ukuran artifact')), integer(ID_MSG), minValue(1, ID_MSG))),
	checksum_sha256: optional(
		pipe(
			string(ERROR_VALIDATION_MSG.string('Checksum')),
			regex(/^[a-f0-9]{64}$/i, 'Checksum SHA-256 harus 64 karakter heksadesimal.')
		)
	)
});
export type TCompleteArtifactUploadValidation = InferOutput<typeof completeArtifactUploadValidation>;

export const linkTestDataFilesValidation = object({
	files: pipe(
		array(
			object({
				id_artifact: pipe(number(ERROR_VALIDATION_MSG.number('ID artifact')), integer(ID_MSG), minValue(1, ID_MSG)),
				file_name: pipe(
					string(ERROR_VALIDATION_MSG.string('Nama file')),
					minLength(1, ERROR_VALIDATION_MSG.minLength('Nama file', 1)),
					maxLength(255, ERROR_VALIDATION_MSG.maxLength('Nama file', 255))
				),
				sequence: optional(pipe(number(ERROR_VALIDATION_MSG.number('Sequence')), integer(ID_MSG), minValue(0, ID_MSG)))
			})
		),
		minLength(1, 'Minimal satu file test data.'),
		maxLength(50, 'Maksimal 50 file test data per permintaan.')
	)
});
export type TLinkTestDataFilesValidation = InferOutput<typeof linkTestDataFilesValidation>;

export default {
	linkTestDataFilesValidation,
	sessionParamValidation,
	sessionArtifactParamValidation,
	presignArtifactUploadValidation,
	completeArtifactUploadValidation
};
