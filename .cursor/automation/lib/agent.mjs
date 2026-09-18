import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Batas aman argumen prompt di Windows (CreateProcess ~32KB total argv). */
const MAX_PROMPT_ARG_CHARS = 8000;

function resolveAgentBin() {
	const which = spawnSync(process.platform === 'win32' ? 'where agent' : 'which agent', {
		shell: true,
		encoding: 'utf8'
	});

	if (which.status !== 0 || !which.stdout?.trim()) {
		throw new Error(
			'Cursor CLI "agent" not found in PATH. Install: curl https://cursor.com/install -fsS | bash'
		);
	}

	const candidates = which.stdout
		.trim()
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	// Windows: prefer .exe agar spawnSync tidak EINVAL pada .cmd
	if (process.platform === 'win32') {
		const exe = candidates.find((p) => /\.exe$/i.test(p));
		if (exe) return exe;
	}

	return candidates[0];
}

/** .cmd/.bat di Windows wajib lewat cmd.exe — spawnSync EINVAL bila shell: false langsung */
function spawnAgent(agentBin, args, options) {
	const isWinBatch = process.platform === 'win32' && /\.(cmd|bat)$/i.test(agentBin);

	if (isWinBatch) {
		return spawnSync('cmd.exe', ['/d', '/s', '/c', agentBin, ...args], {
			...options,
			shell: false
		});
	}

	return spawnSync(agentBin, args, options);
}

function spillPromptToFile(prompt, runPath, repoRoot) {
	const dir = runPath || join(repoRoot, '.cursor', 'runs');
	mkdirSync(dir, { recursive: true });
	const promptFile = join(dir, 'agent-prompt.md');
	writeFileSync(promptFile, prompt, 'utf8');
	const pathForAgent = promptFile.replace(/\\/g, '/');
	return `Ikuti semua instruksi di file berikut:\n${pathForAgent}`;
}

export function runAgent(prompt, options) {
	const {
		repoRoot,
		runPath,
		dryRun = false,
		timeoutSec = 3600,
		apiKey = process.env.CURSOR_API_KEY,
		model = process.env.AGENT_MODEL
	} = options;

	let effectivePrompt = prompt;
	if (effectivePrompt.length > MAX_PROMPT_ARG_CHARS) {
		effectivePrompt = spillPromptToFile(effectivePrompt, runPath, repoRoot);
		console.log(`[agent] Prompt panjang (${prompt.length} chars) — instruksi via file.`);
	}

	const args = ['--print', '--force', '--output-format', 'json', '--workspace', repoRoot];

	if (model) {
		args.push('--model', model);
	}

	args.push(effectivePrompt);

	const cmdPreview = `agent ${args
		.slice(0, -1)
		.map((a) => (a.includes(' ') ? `"${a}"` : a))
		.join(' ')} "<prompt ${effectivePrompt.length} chars>"`;

	if (dryRun) {
		console.log(`[dry-run] agent prompt (${prompt.length} chars)`);
		console.log(`[dry-run] ${cmdPreview}`);
		return { status: 'dry-run', result: null };
	}

	if (!apiKey) {
		throw new Error('CURSOR_API_KEY is required for agent stages (set in env or config.env).');
	}

	const agentBin = resolveAgentBin();

	const result = spawnAgent(agentBin, args, {
		cwd: repoRoot,
		env: { ...process.env, CURSOR_API_KEY: apiKey },
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
		timeout: timeoutSec * 1000,
		shell: false,
		windowsHide: true,
		maxBuffer: 50 * 1024 * 1024
	});

	if (result.error) {
		throw new Error(`Agent spawn failed: ${result.error.message}`);
	}

	if (result.status !== 0) {
		const detail = (result.stderr || result.stdout || '').slice(0, 2000);
		const signal = result.signal ? `, signal ${result.signal}` : '';
		throw new Error(`Agent failed (exit ${result.status ?? 'null'}${signal}): ${detail}`);
	}

	let parsed = null;
	try {
		parsed = JSON.parse(result.stdout);
	} catch {
		parsed = { raw: result.stdout };
	}

	return { status: 'ok', result: parsed, stdout: result.stdout };
}
