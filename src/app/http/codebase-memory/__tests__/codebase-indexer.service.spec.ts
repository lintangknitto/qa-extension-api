jest.mock('../services/github.service', () => ({
	__esModule: true,
	default: {
		parseRepoUrl: () => ({ owner: 'knittotextile', repo: 'knitto-widget-chat' }),
		listRepositoryCodeFiles: jest.fn(),
		fetchFileContent: jest.fn()
	}
}));
jest.mock('../queries/codebase.queries', () => ({ findCodebaseFileByPath: jest.fn() }));
jest.mock('../repo/codebase.repo', () => ({
	upsertCodebaseFile: jest.fn().mockResolvedValue(11),
	deleteFileSymbolsAndChunks: jest.fn(),
	insertCodebaseSymbols: jest.fn(),
	insertCodebaseChunks: jest.fn(),
	pruneRemovedFiles: jest.fn(),
	markCodebaseFileIndexed: jest.fn(),
	PENDING_FILE_HASH: ''
}));
jest.mock('@/libs/services/embedding.service', () => ({
	__esModule: true,
	default: {
		generateBatchEmbeddings: jest.fn(async (texts: string[]) => texts.map(() => [0.1])),
		formatVectorForPg: () => '[0.1]'
	}
}));

import githubService from '../services/github.service';
import { findCodebaseFileByPath } from '../queries/codebase.queries';
import * as codebaseRepo from '../repo/codebase.repo';
import embeddingService from '@/libs/services/embedding.service';
import { indexGitHubRepo } from '../services/codebase-indexer.service';

describe('indexGitHubRepo', () => {
	it('hanya file dengan blob git berubah yang diunduh & di-index; file lama tetap (tidak di-prune)', async () => {
		(githubService.listRepositoryCodeFiles as jest.Mock).mockResolvedValue([
			{ path: 'src/a.ts', sha: 'blob-a', type: 'blob' },
			{ path: 'src/b.ts', sha: 'blob-b2', type: 'blob' }
		]);
		(findCodebaseFileByPath as jest.Mock).mockImplementation(async (_id: number, path: string) =>
			path === 'src/a.ts' ? { file_hash: 'x', git_blob_sha: 'blob-a' } : { file_hash: 'lama', git_blob_sha: 'blob-b1' }
		);
		(githubService.fetchFileContent as jest.Mock).mockResolvedValue('export const b = () => 2;');

		const stats = await indexGitHubRepo(7, 'https://github.com/knittotextile/knitto-widget-chat', 'sha-baru');

		expect(githubService.listRepositoryCodeFiles).toHaveBeenCalledWith('knittotextile', 'knitto-widget-chat', 'sha-baru');
		expect(githubService.fetchFileContent).toHaveBeenCalledTimes(1);
		expect(githubService.fetchFileContent).toHaveBeenCalledWith('knittotextile', 'knitto-widget-chat', 'src/b.ts', 'sha-baru');
		expect(codebaseRepo.upsertCodebaseFile).toHaveBeenCalledWith(7, 'src/b.ts', '', 'typescript', expect.any(Number), expect.any(Object), null);
		expect(codebaseRepo.markCodebaseFileIndexed).toHaveBeenCalledWith(11, expect.stringMatching(/.+/), 'blob-b2');
		expect(codebaseRepo.pruneRemovedFiles).toHaveBeenCalledWith(7, ['src/b.ts', 'src/a.ts']);
		expect(stats).toMatchObject({ files_scanned: 2, files_indexed: 1, files_skipped: 1 });
	});
});

describe('indexSingleFile gagal di tengah (4.6)', () => {
	beforeEach(() => jest.clearAllMocks());

	it('embedding gagal → tidak ada tulisan ke DB dan hash tidak dicatat, sehingga sync berikutnya mengulang file', async () => {
		(githubService.listRepositoryCodeFiles as jest.Mock).mockResolvedValue([{ path: 'src/b.ts', sha: 'blob-b2', type: 'blob' }]);
		(findCodebaseFileByPath as jest.Mock).mockResolvedValue({ file_hash: 'lama', git_blob_sha: 'blob-b1' });
		(githubService.fetchFileContent as jest.Mock).mockResolvedValue('export const b = () => 2;');
		(embeddingService.generateBatchEmbeddings as jest.Mock).mockRejectedValueOnce(new Error('429 rate limit'));

		await expect(indexGitHubRepo(7, 'https://github.com/knittotextile/knitto-widget-chat', 'sha-baru')).rejects.toThrow('429');
		expect(codebaseRepo.upsertCodebaseFile).not.toHaveBeenCalled();
		expect(codebaseRepo.markCodebaseFileIndexed).not.toHaveBeenCalled();

		// Sync kedua: blob di DB masih lama → file diunduh & di-index ulang.
		await indexGitHubRepo(7, 'https://github.com/knittotextile/knitto-widget-chat', 'sha-baru');
		expect(codebaseRepo.insertCodebaseChunks).toHaveBeenCalled();
		expect(codebaseRepo.markCodebaseFileIndexed).toHaveBeenCalledWith(11, expect.any(String), 'blob-b2');
	});

	it('simpan chunk gagal → baris file tertinggal dengan hash kosong (bukan hash/blob baru)', async () => {
		(githubService.listRepositoryCodeFiles as jest.Mock).mockResolvedValue([{ path: 'src/b.ts', sha: 'blob-b2', type: 'blob' }]);
		(findCodebaseFileByPath as jest.Mock).mockResolvedValue({ file_hash: 'lama', git_blob_sha: 'blob-b1' });
		(githubService.fetchFileContent as jest.Mock).mockResolvedValue('export const b = () => 2;');
		(codebaseRepo.insertCodebaseChunks as jest.Mock).mockRejectedValueOnce(new Error('db down'));

		await expect(indexGitHubRepo(7, 'https://github.com/knittotextile/knitto-widget-chat', 'sha-baru')).rejects.toThrow('db down');
		expect(codebaseRepo.upsertCodebaseFile).toHaveBeenCalledWith(7, 'src/b.ts', '', 'typescript', expect.any(Number), expect.any(Object), null);
		expect(codebaseRepo.markCodebaseFileIndexed).not.toHaveBeenCalled();
	});
});
