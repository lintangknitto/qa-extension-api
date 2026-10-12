import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { syncCodebaseUseCase } from '../src/app/http/codebase-memory/use-case/sync-codebase.use-case';
import postgresConnection from '../src/libs/config/postgresConnection';

/**
 * Sync manual codebase memory sebuah project (menunggu sampai selesai).
 *   pnpm index:codebase --project=1                      # semua repo project dari GitHub
 *   pnpm index:codebase --project=1 --repo=owner/repo --branch=dev
 *   pnpm index:codebase --project=1 --dir=../app --repo=owner/repo   # salinan lokal
 *   tambahkan --force untuk re-index semua file
 */
async function main() {
	console.log('=== Knitto Codebase AST & Vector Memory Indexer ===\n');

	const args = process.argv.slice(2);
	const getArg = (flag: string): string | undefined => args.find((a) => a.startsWith(`${flag}=`))?.split('=')[1];

	const projectId = Number(getArg('--project') ?? '1');
	const baseDir = getArg('--dir');
	const force = args.includes('--force');

	try {
		const result = await syncCodebaseUseCase({
			id_project: projectId,
			repo_url: getArg('--repo'),
			branch: getArg('--branch'),
			base_dir: baseDir ? path.resolve(baseDir) : undefined,
			force_reindex: force,
			wait: true,
			trusted: true
		});

		console.log(`Project: ${result.project_name} (ID: ${projectId})\n`);
		let failed = false;
		for (const repo of result.repos) {
			const stats = repo.stats ?? repo.local_stats;
			const detail = stats ? ` — ${stats.files_indexed} file di-index, ${stats.files_skipped} tidak berubah, ${stats.chunks_indexed} chunk` : '';
			console.log(`${repo.status === 'failed' ? '❌' : '✅'} ${repo.repo_key}@${repo.branch || '?'}: ${repo.status}${repo.sha ? ` @${repo.sha.slice(0, 7)}` : ''}${detail}${repo.error ? `\n   ${repo.error}` : ''}`);
			failed = failed || repo.status === 'failed';
		}
		await postgresConnection.end();
		process.exit(failed ? 1 : 0);
	} catch (err: unknown) {
		console.error('\n❌ Gagal melakukan indexing codebase:', (err as Error).message);
		await postgresConnection.end();
		process.exit(1);
	}
}

main();
