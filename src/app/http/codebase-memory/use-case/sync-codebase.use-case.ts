import fs from 'fs';
import path from 'path';
import { findProjectById } from '@/app/http/project/queries/project.queries';
import { assertProjectExists, assertCanManageSpecificProject } from '@/app/http/project/domain/project.domain';
import astParserService from '../services/ast-parser.service';
import chunkerService from '../services/chunker.service';
import embeddingService from '@/libs/services/embedding.service';
import githubService from '../services/github.service';
import { findCodebaseFileByPath } from '../queries/codebase.queries';
import {
	upsertCodebaseFile,
	deleteFileSymbolsAndChunks,
	insertCodebaseSymbols,
	insertCodebaseChunks,
	pruneRemovedFiles
} from '../repo/codebase.repo';
import type { TSyncCodebaseBodyValidation } from '../codebase.request';
import { GeneralException } from '@knittotextile/knitto-core-backend/dist/CoreException';

interface IFileToProcess {
	filePath: string;
	content: string;
	hash: string;
}

const resolveGitHubFiles = async (
	repoUrl: string,
	branch = 'main',
	githubToken?: string
): Promise<IFileToProcess[]> => {
	const { owner, repo } = githubService.parseRepoUrl(repoUrl);
	const tree = await githubService.listRepositoryCodeFiles(owner, repo, branch, githubToken);
	const files: IFileToProcess[] = [];

	for (const item of tree) {
		const content = await githubService.fetchFileContent(owner, repo, item.path, branch, githubToken);
		const hash = chunkerService.computeFileHash(content);
		files.push({ filePath: item.path, content, hash });
	}
	return files;
};

const resolveLocalFiles = (baseDir: string): IFileToProcess[] => {
	const resolvedBase = path.resolve(baseDir);
	const allowedRoots = [
		path.resolve(process.cwd()),
		path.resolve(process.cwd(), '..')
	];
	const isAllowed = allowedRoots.some(
		(allowed) => resolvedBase === allowed || resolvedBase.startsWith(allowed + path.sep)
	);

	if (!isAllowed) {
		throw new GeneralException(`Akses ke direktori "${baseDir}" tidak diizinkan demi keamanan server.`);
	}

	if (!fs.existsSync(resolvedBase)) {
		throw new GeneralException(`Direktori sumber "${baseDir}" tidak ditemukan di server.`);
	}

	const files: IFileToProcess[] = [];
	const ignored = ['node_modules', 'dist', 'build', '.git', '.next', 'coverage', 'test-results', '.cursor', 'database', 'dev-infra', 'logs'];

	const scan = (dir: string): void => {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

			if (entry.isDirectory()) {
				if (!ignored.includes(entry.name)) scan(fullPath);
			} else if (entry.isFile()) {
				const exts = ['.ts', '.tsx', '.js', '.jsx'];
				if (exts.some((ext) => entry.name.endsWith(ext))) {
					const content = fs.readFileSync(fullPath, 'utf-8');
					const hash = chunkerService.computeFileHash(content);
					files.push({ filePath: relPath, content, hash });
				}
			}
		}
	};

	scan(baseDir);
	return files;
};

const indexSingleFile = async (
	idProject: number,
	file: IFileToProcess
): Promise<number> => {
	const astResult = astParserService.parseSource(file.filePath, file.content);

	const idFile = await upsertCodebaseFile(
		idProject,
		file.filePath,
		file.hash,
		file.filePath.endsWith('.js') || file.filePath.endsWith('.jsx') ? 'javascript' : 'typescript',
		astResult.total_lines,
		astResult.summary
	);

	await deleteFileSymbolsAndChunks(idFile);
	await insertCodebaseSymbols(idProject, idFile, astResult.symbols);

	const chunks = chunkerService.createChunks(file.filePath, file.content, astResult);
	if (chunks.length > 0) {
		const textsToEmbed = chunks.map((c) => c.content);
		const embeddings = await embeddingService.generateBatchEmbeddings(textsToEmbed);

		const chunksWithEmbeddings = chunks.map((chunk, index) => ({
			chunk,
			vectorStr: embeddingService.formatVectorForPg(embeddings[index])
		}));

		await insertCodebaseChunks(idProject, idFile, chunksWithEmbeddings);
	}

	return chunks.length;
};

type TSyncSource = Pick<TSyncCodebaseBodyValidation, 'source_type' | 'repo_url' | 'base_dir' | 'branch' | 'github_token'>;

/** Files come from: an explicit GitHub repo, else the project's program repos, else the project repo, else local disk. */
const resolveFilesToProcess = async (
	data: TSyncSource,
	project: { repo_url?: string | null; programs?: Array<{ repo_url?: string | null }> }
): Promise<IFileToProcess[]> => {
	if (data.source_type === 'github' || (data.repo_url && !data.base_dir)) {
		return resolveGitHubFiles(data.repo_url || '', data.branch, data.github_token);
	}
	if (data.base_dir) {
		return resolveLocalFiles(path.resolve(data.base_dir));
	}

	const programRepos = (Array.isArray(project.programs) ? project.programs : [])
		.map((p) => p.repo_url)
		.filter((url): url is string => Boolean(url));
	if (programRepos.length > 0) {
		const files: IFileToProcess[] = [];
		for (const repoUrl of programRepos) {
			files.push(...(await resolveGitHubFiles(repoUrl, data.branch, data.github_token)));
		}
		return files;
	}
	if (project.repo_url) {
		return resolveGitHubFiles(project.repo_url, data.branch, data.github_token);
	}
	return resolveLocalFiles(path.resolve(process.cwd()));
};

const indexFiles = async (idProject: number, files: IFileToProcess[], forceReindex: boolean) => {
	let filesIndexed = 0;
	let filesSkipped = 0;
	let totalChunksIndexed = 0;

	for (const file of files) {
		const existing = await findCodebaseFileByPath(idProject, file.filePath);
		if (existing && existing.file_hash === file.hash && !forceReindex) {
			filesSkipped++;
			continue;
		}
		totalChunksIndexed += await indexSingleFile(idProject, file);
		filesIndexed++;
	}

	return { filesIndexed, filesSkipped, totalChunksIndexed };
};

export const syncCodebaseUseCase = async (
	data: TSyncCodebaseBodyValidation & {
		id_project: number;
		userId?: number;
		userLevel?: string;
	}
): Promise<{
	success: boolean;
	project_name: string;
	files_scanned: number;
	files_indexed: number;
	files_skipped: number;
	chunks_indexed: number;
	duration_ms: number;
}> => {
	const startTime = Date.now();
	const project = await findProjectById(data.id_project);
	assertProjectExists(project);

	if (data.userId && data.userLevel) {
		assertCanManageSpecificProject(data.userLevel, data.userId, project);
	}

	const filesToProcess = await resolveFilesToProcess(data, project);
	const { filesIndexed, filesSkipped, totalChunksIndexed } = await indexFiles(
		data.id_project,
		filesToProcess,
		Boolean(data.force_reindex)
	);

	const activePaths = filesToProcess.map((f) => f.filePath);
	await pruneRemovedFiles(data.id_project, activePaths);

	return {
		success: true,
		project_name: String(project?.name ?? ''),
		files_scanned: filesToProcess.length,
		files_indexed: filesIndexed,
		files_skipped: filesSkipped,
		chunks_indexed: totalChunksIndexed,
		duration_ms: Date.now() - startTime
	};
};
