import postgresConnection from '@/libs/config/postgresConnection';
import type { IExtractedSymbol } from '../services/ast-parser.service';
import type { ICodeChunk } from '../services/chunker.service';

export const upsertCodebaseFile = async (
	idProject: number,
	filePath: string,
	fileHash: string,
	language: string,
	totalLines: number,
	astSummary: Record<string, unknown>
): Promise<number> => {
	const [row] = await postgresConnection.raw<Array<{ id_file: number | string }>>(
		`INSERT INTO codebase_files (
			id_project, file_path, file_hash, language, total_lines, ast_summary, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
		ON CONFLICT (id_project, file_path) DO UPDATE SET
			file_hash = EXCLUDED.file_hash,
			language = EXCLUDED.language,
			total_lines = EXCLUDED.total_lines,
			ast_summary = EXCLUDED.ast_summary,
			updated_at = CURRENT_TIMESTAMP
		RETURNING id_file`,
		[
			idProject,
			filePath,
			fileHash,
			language,
			totalLines,
			JSON.stringify(astSummary)
		]
	);

	return Number(row?.id_file);
};

export const deleteFileSymbolsAndChunks = async (idFile: number): Promise<void> => {
	await postgresConnection.raw('DELETE FROM codebase_symbols WHERE id_file = $1', [idFile]);
	await postgresConnection.raw('DELETE FROM codebase_chunks WHERE id_file = $1', [idFile]);
};

export const insertCodebaseSymbols = async (
	idProject: number,
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
			idProject,
			sym.name,
			sym.kind,
			sym.signature || null,
			sym.docstring || null,
			sym.start_line,
			sym.end_line,
			sym.scope_path || null,
			JSON.stringify(sym.metadata || {})
		);
	}

	const query = `
		INSERT INTO codebase_symbols (
			id_file, id_project, name, kind, signature, docstring,
			start_line, end_line, scope_path, metadata
		) VALUES ${valuesClauses.join(', ')}
	`;

	await postgresConnection.raw(query, params);
};

export const insertCodebaseChunks = async (
	idProject: number,
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
			idProject,
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
			id_file, id_project, chunk_type, content, start_line, end_line, embedding, metadata
		) VALUES ${valuesClauses.join(', ')}
	`;

	await postgresConnection.raw(query, params);
};

export const pruneRemovedFiles = async (
	idProject: number,
	activeFilePaths: string[]
): Promise<number> => {
	if (activeFilePaths.length === 0) {
		const [res] = await postgresConnection.raw<Array<{ count: string | number }>>(
			'WITH deleted AS (DELETE FROM codebase_files WHERE id_project = $1 RETURNING *) SELECT count(*) FROM deleted',
			[idProject]
		);
		return Number(res?.count ?? 0);
	}

	const [res] = await postgresConnection.raw<Array<{ count: string | number }>>(
		'WITH deleted AS (DELETE FROM codebase_files WHERE id_project = $1 AND file_path != ALL($2) RETURNING *) SELECT count(*) FROM deleted',
		[idProject, activeFilePaths]
	);
	return Number(res?.count ?? 0);
};
