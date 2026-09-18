#!/usr/bin/env node
/**
 * Cursor beforeShellExecution — block destructive git/shell commands.
 * Node.js (headless on Windows; no Git Bash window).
 */
'use strict';

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

function deny(message) {
	process.stdout.write(
		JSON.stringify({ permission: 'deny', agentMessage: message })
	);
	process.exit(0);
}

function allow() {
	process.stdout.write(JSON.stringify({ permission: 'allow' }));
	process.exit(0);
}

async function main() {
	const raw = await readStdin();
	let command = '';

	try {
		const payload = JSON.parse(raw || '{}');
		command = payload.command || '';
	} catch {
		allow();
		return;
	}

	if (!command) {
		allow();
		return;
	}

	if (/git\s+push.*(--force|-f)/i.test(command) && /(main|master)/i.test(command)) {
		deny('Blocked: git push --force to main/master is not allowed.');
	}

	if (/git\s+reset\s+--hard/i.test(command)) {
		deny('Blocked: git reset --hard is not allowed.');
	}

	if (/git\s+clean\s+(-fdx|-fd|-fx|-f)/i.test(command)) {
		deny('Blocked: git clean -fdx (or similar) is not allowed.');
	}

	if (/rm\s+-rf\s+(\/|C:\\\\|\/c\/|\/mnt\/)/i.test(command)) {
		deny('Blocked: rm -rf on system or root path is not allowed.');
	}

	if (/git\s+commit/i.test(command) && /@ts-ignore|as\s+any/i.test(command)) {
		deny('Blocked: git commit message must not contain @ts-ignore or as any.');
	}

	allow();
}

main().catch(() => allow());
