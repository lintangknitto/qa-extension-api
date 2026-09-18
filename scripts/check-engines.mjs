import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));

const requiredNodeVersion = readFileSync(join(rootDir, '.nvmrc'), 'utf8').trim();
const packageManager = pkg.packageManager ?? 'pnpm@11.17.0';
const expectedPnpmVersion = packageManager.replace(/^pnpm@/, '');

function fail(message) {
	console.error(message);
	process.exit(1);
}

if (pkg.engines?.node && pkg.engines.node !== requiredNodeVersion) {
	fail(
		`package.json engines.node (${pkg.engines.node}) tidak selaras dengan .nvmrc (${requiredNodeVersion}).`
	);
}

const userAgent = process.env.npm_config_user_agent ?? '';
if (userAgent.includes('yarn')) {
	fail('Yarn tidak didukung. Gunakan pnpm sesuai packageManager di package.json.');
}
if (userAgent.includes('npm') && !userAgent.includes('pnpm')) {
	fail(
		`npm tidak didukung. Gunakan pnpm: corepack enable && corepack prepare pnpm@${expectedPnpmVersion} --activate`
	);
}

const nodeVersion = process.versions.node;
if (nodeVersion !== requiredNodeVersion) {
	fail(
		`Node.js ${nodeVersion} tidak didukung. Wajib Node.js ${requiredNodeVersion} (lihat .nvmrc / package.json engines).`
	);
}

let pnpmVersion;
try {
	pnpmVersion = execSync('pnpm --version', { encoding: 'utf8' }).trim();
} catch {
	fail(
		`pnpm tidak ditemukan. Aktifkan Corepack: corepack enable && corepack prepare pnpm@${expectedPnpmVersion} --activate`
	);
}

if (pnpmVersion !== expectedPnpmVersion) {
	fail(
		`pnpm ${pnpmVersion} tidak didukung. Wajib pnpm@${expectedPnpmVersion} (sesuai packageManager di package.json).`
	);
}

console.log(`Engine check passed: Node ${nodeVersion}, pnpm ${pnpmVersion}`);
