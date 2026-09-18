import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config.env');

export function loadConfigEnv() {
	if (!existsSync(CONFIG_PATH)) return;
	const lines = readFileSync(CONFIG_PATH, 'utf8').split('\n');
	for (const line of lines) {
		const t = line.trim();
		if (!t || t.startsWith('#')) continue;
		const eq = t.indexOf('=');
		if (eq === -1) continue;
		const key = t.slice(0, eq).trim();
		const val = t.slice(eq + 1).trim();
		if (key && process.env[key] === undefined) {
			process.env[key] = val;
		}
	}
}
