#!/usr/bin/env node
/**
 * Cursor afterFileEdit — eslint --fix on edited *.ts / *.tsx (informational).
 * Node.js (headless on Windows; no Git Bash window).
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const { stdin } = process;

function readStdin() {
	return new Promise((resolve) => {
		let data = '';
		stdin.setEncoding('utf8');
		stdin.on('data', (chunk) => {
			data += chunk;
		});
		stdin.on('end', () => resolve(data));
	});
}

async function main() {
	const raw = await readStdin();
	let filePath = '';
	let workspace = process.cwd();

	try {
		const payload = JSON.parse(raw || '{}');
		filePath = payload.file_path || '';
		if (Array.isArray(payload.workspace_roots) && payload.workspace_roots[0]) {
			workspace = payload.workspace_roots[0];
		}
	} catch {
		process.exit(0);
	}

	if (!filePath || !/\.tsx?$/i.test(filePath)) {
		process.exit(0);
	}

	const normalized = filePath.replace(/\\/g, '/');
	const isHttpLayer =
		normalized.includes('/src/app/http/') ||
		normalized.includes('\\src\\app\\http\\');
	const isTestFile =
		/\/__tests__\//i.test(normalized) || /\.spec\.tsx?$/i.test(normalized);

	if (!isHttpLayer || isTestFile) {
		process.exit(0);
	}

	const eslintBin = path.join(workspace, 'node_modules', '.bin', 'eslint');
	const eslintCmd = process.platform === 'win32' ? `${eslintBin}.cmd` : eslintBin;

	spawnSync(eslintCmd, ['--fix', filePath], {
		cwd: workspace,
		stdio: 'ignore',
		shell: process.platform === 'win32',
		timeout: 60_000
	});

	process.exit(0);
}

main().catch(() => process.exit(0));
