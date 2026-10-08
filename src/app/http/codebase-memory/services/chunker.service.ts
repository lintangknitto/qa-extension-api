import crypto from 'crypto';
import type { IAstParseResult } from './ast-parser.service';

export interface ICodeChunk {
	chunk_type: 'symbol' | 'route_handler' | 'overview' | 'block';
	content: string;
	start_line: number;
	end_line: number;
	symbol_name?: string;
	metadata?: Record<string, unknown>;
}

export class ChunkerService {
	public computeFileHash(content: string): string {
		return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
	}

	public createChunks(
		filePath: string,
		sourceCode: string,
		astResult: IAstParseResult
	): ICodeChunk[] {
		const lines = sourceCode.split('\n');
		const chunks: ICodeChunk[] = [];

		// 1. If symbols are detected, create symbol-based chunks
		if (astResult.symbols.length > 0) {
			for (const sym of astResult.symbols) {
				const start = Math.max(1, sym.start_line);
				const end = Math.min(lines.length, Math.max(sym.start_line, sym.end_line));
				const codeSlice = lines.slice(start - 1, end).join('\n').trim();

				if (!codeSlice) continue;

				const header = `// File: ${filePath} | ${sym.kind.toUpperCase()}: ${sym.name} (Lines ${start}-${end})\n`;
				const rawContent = `${header}${sym.docstring ? sym.docstring + '\n' : ''}${codeSlice}`;
				const fullContent = rawContent.length > 6000 ? rawContent.slice(0, 6000) : rawContent;

				chunks.push({
					chunk_type: sym.kind === 'route_handler' ? 'route_handler' : 'symbol',
					content: fullContent,
					start_line: start,
					end_line: end,
					symbol_name: sym.name,
					metadata: {
						kind: sym.kind,
						signature: sym.signature,
						scope_path: sym.scope_path
					}
				});
			}
		}

		// 2. If no symbols or for file overview, create a top-level file overview chunk
		if (chunks.length === 0) {
			const maxOverviewLines = Math.min(lines.length, 120);
			const overviewCode = lines.slice(0, maxOverviewLines).join('\n').trim();
			if (overviewCode) {
				const rawOverview = `// File: ${filePath} (Overview, ${lines.length} lines)\n${overviewCode}`;
				const fullContent = rawOverview.length > 6000 ? rawOverview.slice(0, 6000) : rawOverview;

				chunks.push({
					chunk_type: 'overview',
					content: fullContent,
					start_line: 1,
					end_line: maxOverviewLines,
					metadata: {
						imports: astResult.imports.map((i) => i.source),
						exports: astResult.exports
					}
				});
			}
		}

		return chunks;
	}
}

export default new ChunkerService();
