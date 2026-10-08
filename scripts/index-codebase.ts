import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { syncCodebaseUseCase } from '../src/app/http/codebase-memory/use-case/sync-codebase.use-case';
import postgresConnection from '../src/libs/config/postgresConnection';

async function main() {
	console.log('=== Knitto Codebase AST & Vector Memory Indexer ===\n');

	const args = process.argv.slice(2);
	const getArg = (flag: string, fallback: string): string => {
		const found = args.find((a) => a.startsWith(`${flag}=`));
		return found ? found.split('=')[1] : fallback;
	};

	const projectId = Number(getArg('--project', '1'));
	const baseDir = getArg('--dir', path.resolve(__dirname, '..'));
	const repoUrl = getArg('--repo', '');
	const force = args.includes('--force');

	console.log(`📌 Target Project ID : ${projectId}`);
	if (repoUrl) {
		console.log(`🌐 Source Mode       : GitHub (${repoUrl})`);
	} else {
		console.log(`📂 Source Directory  : ${baseDir}`);
	}
	console.log(`🔄 Force Reindex     : ${force}\n`);
	console.log('⏳ Memulai pemindaian, ekstraksi AST, dan embedding ke PostgreSQL pgvector...');

	try {
		const result = await syncCodebaseUseCase({
			id_project: projectId,
			source_type: repoUrl ? 'github' : 'local',
			base_dir: repoUrl ? undefined : baseDir,
			repo_url: repoUrl || undefined,
			force_reindex: force
		});

		console.log('\n✅ Sinkronisasi Codebase Memory Berhasil!');
		console.log('--------------------------------------------------');
		console.log(`Project          : ${result.project_name} (ID: ${projectId})`);
		console.log(`Files Scanned    : ${result.files_scanned}`);
		console.log(`Files Indexed    : ${result.files_indexed}`);
		console.log(`Files Skipped    : ${result.files_skipped} (Unchanged cache)`);
		console.log(`Chunks Indexed   : ${result.chunks_indexed}`);
		console.log(`Execution Time   : ${(result.duration_ms / 1000).toFixed(2)}s`);
		console.log('--------------------------------------------------\n');

		await postgresConnection.end();
		process.exit(0);
	} catch (err: unknown) {
		console.error('\n❌ Gagal melakukan indexing codebase:', (err as Error).message);
		await postgresConnection.end();
		process.exit(1);
	}
}

main();
