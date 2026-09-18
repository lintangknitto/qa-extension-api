/**
 * Guard destructive shell commands (shared with hooks/guard-shell.js logic).
 */
export function assertShellAllowed(command) {
	if (!command || typeof command !== 'string') return;

	if (/git\s+push.*(--force|-f)/i.test(command) && /(main|master)/i.test(command)) {
		throw new Error('Blocked: git push --force to main/master is not allowed.');
	}
	if (/git\s+reset\s+--hard/i.test(command)) {
		throw new Error('Blocked: git reset --hard is not allowed.');
	}
	if (/git\s+clean\s+(-fdx|-fd|-fx|-f)/i.test(command)) {
		throw new Error('Blocked: git clean -fdx (or similar) is not allowed.');
	}
	if (/rm\s+-rf\s+(\/|C:\\\\|\/c\/|\/mnt\/)/i.test(command)) {
		throw new Error('Blocked: rm -rf on system or root path is not allowed.');
	}
	if (/git\s+commit/i.test(command) && /@ts-ignore|as\s+any/i.test(command)) {
		throw new Error('Blocked: git commit message must not contain @ts-ignore or as any.');
	}
}
