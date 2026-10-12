import fs from 'fs';
import path from 'path';
import { GeneralException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import embeddingService from '@/libs/services/embedding.service';
import astParserService from './ast-parser.service';
import chunkerService from './chunker.service';
import githubService from './github.service';
import { findCodebaseFileByPath } from '../queries/codebase.queries';
import {
	upsertCodebaseFile,
	deleteFileSymbolsAndChunks,
	insertCodebaseSymbols,
	insertCodebaseChunks,
	pruneRemovedFiles,
	markCodebaseFileIndexed,
	PENDING_FILE_HASH
} from '../repo/codebase.repo';

/** Dipanggil tiap file diproses (mis. heartbeat sync); pemanggil yang men-throttle. */
export type TProgressCallback = () => Promise<void>;

export interface IIndexStats {
	files_scanned: number;
	files_indexed: number;
	files_skipped: number;
	chunks_indexed: number;
}

interface IFileToProcess {
	filePath: string;
	content: string;
	hash: string;
	gitBlobSha: string | null;
}

/**
 * Index satu file. Embedding dibuat sebelum menulis apa pun, dan hash/blob baru baru dicatat setelah simbol & chunk
 * tersimpan: bila gagal di tengah, baris file tertinggal dengan hash kosong sehingga sync berikutnya mengulangnya
 * (tidak pernah tampak "sudah ter-index" tanpa chunk).
 */
const indexSingleFile = async (idRepo: number, file: IFileToProcess): Promise<number> => {
	const astResult = astParserService.parseSource(file.filePath, file.content);
	const chunks = chunkerService.createChunks(file.filePath, file.content, astResult);
	const embeddings = chunks.length > 0 ? await embeddingService.generateBatchEmbeddings(chunks.map((c) => c.content)) : [];

	const idFile = await upsertCodebaseFile(
		idRepo,
		file.filePath,
		PENDING_FILE_HASH,
		file.filePath.endsWith('.js') || file.filePath.endsWith('.jsx') ? 'javascript' : 'typescript',
		astResult.total_lines,
		astResult.summary,
		null
	);

	await deleteFileSymbolsAndChunks(idFile);
	await insertCodebaseSymbols(idRepo, idFile, astResult.symbols);
	if (chunks.length > 0) {
		await insertCodebaseChunks(
			idRepo,
			idFile,
			chunks.map((chunk, index) => ({ chunk, vectorStr: embeddingService.formatVectorForPg(embeddings[index]) }))
		);
	}
	await markCodebaseFileIndexed(idFile, file.hash, file.gitBlobSha);
	return chunks.length;
};

/** Index file yang berubah (hash konten beda) lalu hapus file yang sudah tidak ada di sumber. */
const indexFiles = async (
	idRepo: number,
	files: IFileToProcess[],
	force: boolean,
	skippedUpfront: string[],
	onProgress?: TProgressCallback
): Promise<IIndexStats> => {
	const stats: IIndexStats = { files_scanned: files.length + skippedUpfront.length, files_indexed: 0, files_skipped: skippedUpfront.length, chunks_indexed: 0 };
	for (const file of files) {
		await onProgress?.();
		const existing = await findCodebaseFileByPath(idRepo, file.filePath);
		if (existing && existing.file_hash === file.hash && !force) {
			stats.files_skipped++;
			continue;
		}
		stats.chunks_indexed += await indexSingleFile(idRepo, file);
		stats.files_indexed++;
	}
	await pruneRemovedFiles(idRepo, [...files.map((f) => f.filePath), ...skippedUpfront]);
	return stats;
};

/**
 * Index repo GitHub pada commit `ref` (SHA) agar isi konsisten dengan SHA yang dicatat.
 * File dengan blob git sama seperti index terakhir tidak diunduh ulang.
 */
export const indexGitHubRepo = async (
	idRepo: number,
	repoUrl: string,
	ref: string,
	force = false,
	onProgress?: TProgressCallback
): Promise<IIndexStats> => {
	const { owner, repo } = githubService.parseRepoUrl(repoUrl);
	const tree = await githubService.listRepositoryCodeFiles(owner, repo, ref);
	const files: IFileToProcess[] = [];
	const unchanged: string[] = [];
	for (const item of tree) {
		await onProgress?.();
		if (!force) {
			const existing = await findCodebaseFileByPath(idRepo, item.path);
			if (existing?.git_blob_sha && existing.git_blob_sha === item.sha) {
				unchanged.push(item.path);
				continue;
			}
		}
		const content = await githubService.fetchFileContent(owner, repo, item.path, ref);
		files.push({ filePath: item.path, content, hash: chunkerService.computeFileHash(content), gitBlobSha: item.sha });
	}
	return indexFiles(idRepo, files, force, unchanged, onProgress);
};

const IGNORED_DIRS = ['node_modules', 'dist', 'build', '.git', '.next', 'coverage', 'test-results', '.cursor', 'database', 'dev-infra', 'logs'];
const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];

/** Index salinan lokal sebuah repo (CLI/manual). Dibatasi ke direktori kerja server demi keamanan. */
export const indexLocalDirectory = async (idRepo: number, baseDir: string, force = false, onProgress?: TProgressCallback): Promise<IIndexStats> => {
	const resolvedBase = path.resolve(baseDir);
	const allowedRoots = [path.resolve(process.cwd()), path.resolve(process.cwd(), '..')];
	const isAllowed = allowedRoots.some((allowed) => resolvedBase === allowed || resolvedBase.startsWith(allowed + path.sep));
	if (!isAllowed) throw new GeneralException(`Akses ke direktori "${baseDir}" tidak diizinkan demi keamanan server.`);
	if (!fs.existsSync(resolvedBase)) throw new GeneralException(`Direktori sumber "${baseDir}" tidak ditemukan di server.`);

	const files: IFileToProcess[] = [];
	const scan = (dir: string): void => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!IGNORED_DIRS.includes(entry.name)) scan(fullPath);
			} else if (entry.isFile() && CODE_EXTS.some((ext) => entry.name.endsWith(ext))) {
				const content = fs.readFileSync(fullPath, 'utf-8');
				files.push({
					filePath: path.relative(resolvedBase, fullPath).replace(/\\/g, '/'),
					content,
					hash: chunkerService.computeFileHash(content),
					gitBlobSha: null
				});
			}
		}
	};
	scan(resolvedBase);
	return indexFiles(idRepo, files, force, [], onProgress);
};
