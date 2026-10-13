import postgresConnection from '@/libs/config/postgresConnection';
import type { IExtractedSymbol } from '../services/ast-parser.service';
import type { ICodeChunk } from '../services/chunker.service';

/** Hash penanda file yang sedang/gagal di-index: tidak pernah sama dengan hash konten, jadi selalu diulang. */
export const PENDING_FILE_HASH = '';

/** Catat hash konten & blob git setelah simbol dan chunk file tersimpan. */
export const markCodebaseFileIndexed = async (idFile: number, fileHash: string, gitBlobSha: string | null): Promise<void> => {
	await postgresConnection.raw(
		'UPDATE codebase_files SET file_hash = $2, git_blob_sha = $3, updated_at = CURRENT_TIMESTAMP WHERE id_file = $1',
		[idFile, fileHash, gitBlobSha]
	);
};

/** Kolom VARCHAR: nama simbol hasil AST bisa sangat panjang (mis. template literal/ekspresi). */
const truncate = (value: string, max: number): string => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

export const upsertCodebaseFile = async (
	idRepo: number,
	filePath: string,
	fileHash: string,
	language: string,
	totalLines: number,
	astSummary: Record<string, unknown>,
	gitBlobSha: string | null = null
): Promise<number> => {
	const [row] = await postgresConnection.raw<Array<{ id_file: number | string }>>(
		`INSERT INTO codebase_files (
			id_repo, file_path, file_hash, language, total_lines, ast_summary, git_blob_sha, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
		ON CONFLICT (id_repo, file_path) DO UPDATE SET
			file_hash = EXCLUDED.file_hash,
			language = EXCLUDED.language,
			total_lines = EXCLUDED.total_lines,
			ast_summary = EXCLUDED.ast_summary,
			git_blob_sha = EXCLUDED.git_blob_sha,
			updated_at = CURRENT_TIMESTAMP
		RETURNING id_file`,
		[
			idRepo,
			filePath,
			fileHash,
			language,
			totalLines,
			JSON.stringify(astSummary),
			gitBlobSha
		]
	);

	return Number(row?.id_file);
};

export const deleteFileSymbolsAndChunks = async (idFile: number): Promise<void> => {
	await postgresConnection.raw('DELETE FROM codebase_symbols WHERE id_file = $1', [idFile]);
	await postgresConnection.raw('DELETE FROM codebase_chunks WHERE id_file = $1', [idFile]);
};

export const insertCodebaseSymbols = async (
	idRepo: number,
	idFile: number,
	symbols: IExtractedSymbol[]
): Promise<void> => {
	if (symbols.length === 0) return;

	const valuesClauses: string[] = [];
	const params: unknown[] = [];

	for (const sym of symbols) {
		const offset = params.length;
		valuesClauses.push(
			`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`
		);
		params.push(
			idFile,
			idRepo,
			truncate(sym.name, 255),
			truncate(sym.kind, 50),
			sym.signature || null,
			sym.docstring || null,
			sym.start_line,
			sym.end_line,
			sym.scope_path ? truncate(sym.scope_path, 255) : null,
			JSON.stringify(sym.metadata || {})
		);
	}

	const query = `
		INSERT INTO codebase_symbols (
			id_file, id_repo, name, kind, signature, docstring,
			start_line, end_line, scope_path, metadata
		) VALUES ${valuesClauses.join(', ')}
	`;

	await postgresConnection.raw(query, params);
};

export const insertCodebaseChunks = async (
	idRepo: number,
	idFile: number,
	chunksWithEmbeddings: Array<{ chunk: ICodeChunk; vectorStr: string }>
): Promise<void> => {
	if (chunksWithEmbeddings.length === 0) return;

	const valuesClauses: string[] = [];
	const params: unknown[] = [];

	for (const item of chunksWithEmbeddings) {
		const offset = params.length;
		valuesClauses.push(
			`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}::vector, $${offset + 8})`
		);
		params.push(
			idFile,
			idRepo,
			item.chunk.chunk_type,
			item.chunk.content,
			item.chunk.start_line,
			item.chunk.end_line,
			item.vectorStr,
			JSON.stringify(item.chunk.metadata || {})
		);
	}

	const query = `
		INSERT INTO codebase_chunks (
			id_file, id_repo, chunk_type, content, start_line, end_line, embedding, metadata
		) VALUES ${valuesClauses.join(', ')}
	`;

	await postgresConnection.raw(query, params);
};

export const pruneRemovedFiles = async (
	idRepo: number,
	activeFilePaths: string[]
): Promise<number> => {
	if (activeFilePaths.length === 0) {
		const [res] = await postgresConnection.raw<Array<{ count: string | number }>>(
			'WITH deleted AS (DELETE FROM codebase_files WHERE id_repo = $1 RETURNING *) SELECT count(*) FROM deleted',
			[idRepo]
		);
		return Number(res?.count ?? 0);
	}

	const [res] = await postgresConnection.raw<Array<{ count: string | number }>>(
		'WITH deleted AS (DELETE FROM codebase_files WHERE id_repo = $1 AND file_path != ALL($2) RETURNING *) SELECT count(*) FROM deleted',
		[idRepo, activeFilePaths]
	);
	return Number(res?.count ?? 0);
};
