import { spawn } from 'child_process';
import path from 'path';

async function runE2E() {
	console.info('=====================================================');
	console.info('🚀 MEMULAI POSTGRESQL RECORDER E2E TEST SUITE');
	console.info('=====================================================');

	const projectRoot = path.resolve(__dirname, '../../');
	const jestCmd = process.platform === 'win32' ? 'jest.cmd' : 'jest';
	const jestPath = path.resolve(projectRoot, 'node_modules/.bin', jestCmd);

	const args = [
		'tests/e2e/harness/__tests__/backend-service.spec.ts',
		'tests/e2e/harness/__tests__/disposable-stack.spec.ts',
		'tests/e2e/harness/__tests__/migration-and-fixtures.spec.ts',
		'tests/e2e/harness/__tests__/extension-golden-path.spec.ts',
		'tests/e2e/harness/__tests__/codegen-and-investigation.spec.ts',
		'tests/e2e/harness/__tests__/test-case-format-v4.spec.ts',
		'tests/e2e/harness/__tests__/minio-public-read.spec.ts',
		'tests/e2e/harness/__tests__/multi-tab-and-run-history.spec.ts',
		// jest.config ignores tests/e2e so `pnpm test` stays a fast unit run; lift that here.
		'--testPathIgnorePatterns=/node_modules/',
		'--runInBand',
		'--forceExit'
	];

	const child = spawn(jestPath, args, {
		cwd: projectRoot,
		env: process.env,
		stdio: 'inherit',
		shell: true
	});

	child.on('error', (err) => {
		console.error(`❌ Gagal menjalankan jest: ${err.message}`);
		process.exit(1);
	});

	child.on('exit', (code, signal) => {
		console.info('=====================================================');
		if (code === 0) {
			console.info('✅ SELURUH POSTGRESQL RECORDER E2E TEST BERHASIL LULUS!');
		} else {
			console.error(`❌ POSTGRESQL RECORDER E2E TEST GAGAL (${signal ? `signal: ${signal}` : `exit code: ${code}`})`);
		}
		console.info('=====================================================');
		// A signal-killed jest reports code === null; that must fail the run, not exit 0.
		process.exit(code ?? 1);
	});
}

runE2E().catch((err) => {
	console.error('Fatal error running E2E:', err);
	process.exit(1);
});
