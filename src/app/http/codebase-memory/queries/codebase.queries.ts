import postgresConnection from '@/libs/config/postgresConnection';

export interface ISimilarChunkResult {
	id_chunk: number;
	id_file: number;
	id_project: number;
	file_path: string;
	chunk_type: string;
	content: string;
	start_line: number;
	end_line: number;
	metadata: Record<string, unknown>;
	similarity: number;
}

export const findCodebaseFileByPath = async (
	idProject: number,
	filePath: string
): Promise<Entity.IQaCodebaseFile | null> => {
	const rows = await postgresConnection.raw<Entity.IQaCodebaseFile[]>(
		'SELECT * FROM codebase_files WHERE id_project = $1 AND file_path = $2 LIMIT 1',
		[idProject, filePath]
	);
	return rows[0] ?? null;
};

export const listCodebaseFiles = async (
	idProject: number
): Promise<Entity.IQaCodebaseFile[]> => {
	return postgresConnection.raw<Entity.IQaCodebaseFile[]>(
		'SELECT id_file, id_project, file_path, file_hash, language, total_lines, updated_at FROM codebase_files WHERE id_project = $1 ORDER BY file_path ASC',
		[idProject]
	);
};

export const searchCodebaseSymbols = async (
	idProject: number,
	search?: string,
	kind?: string,
	limit = 50
): Promise<Entity.IQaCodebaseSymbol[]> => {
	const conditions: string[] = ['s.id_project = $1'];
	const params: (string | number)[] = [idProject];

	if (search && search.trim()) {
		params.push(`%${search.trim()}%`);
		conditions.push(`(s.name ILIKE $${params.length} OR s.signature ILIKE $${params.length})`);
	}

	if (kind && kind.trim()) {
		params.push(kind.trim().toLowerCase());
		conditions.push(`LOWER(s.kind) = $${params.length}`);
	}

	params.push(limit);
	const query = `
		SELECT s.*, f.file_path
		FROM codebase_symbols s
		JOIN codebase_files f ON f.id_file = s.id_file
		WHERE ${conditions.join(' AND ')}
		ORDER BY s.name ASC
		LIMIT $${params.length}
	`;

	return postgresConnection.raw<Entity.IQaCodebaseSymbol[]>(query, params);
};

export const searchCodebaseChunksByVector = async (
	idProject: number,
	vectorStr: string,
	limit = 10,
	similarityThreshold = 0.3
): Promise<ISimilarChunkResult[]> => {
	const query = `
		SELECT 
			c.id_chunk,
			c.id_file,
			c.id_project,
			f.file_path,
			c.chunk_type,
			c.content,
			c.start_line,
			c.end_line,
			c.metadata,
			(1 - (c.embedding <=> $1::vector)) AS similarity
		FROM codebase_chunks c
		JOIN codebase_files f ON f.id_file = c.id_file
		WHERE c.id_project = $2
		  AND (c.embedding <=> $1::vector) <= (1 - $3)
		ORDER BY (c.embedding <=> $1::vector) ASC
		LIMIT $4
	`;

	const rows = await postgresConnection.raw<ISimilarChunkResult[]>(query, [
		vectorStr,
		idProject,
		similarityThreshold,
		limit
	]);

	return rows.map((r) => ({
		...r,
		id_chunk: Number(r.id_chunk),
		id_file: Number(r.id_file),
		id_project: Number(r.id_project),
		start_line: Number(r.start_line),
		end_line: Number(r.end_line),
		similarity: Number(r.similarity)
	}));
};
