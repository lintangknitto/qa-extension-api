#!/usr/bin/env node
/**
 * Knitto Fix Pipeline — bugfix di epic dari GitHub issue
 * git → fix (debugger) → pr → review → assign
 * Usage: node .cursor/automation/run-fix.mjs --pb PB-1.700.2 --task slug --github-issue 456
 */
import { spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFixAgent } from './fix-agent.mjs';
import { runAgent } from './lib/agent.mjs';
import { loadConfigEnv } from './lib/config.mjs';
import {
	FIX_STAGES,
	createInitialFixState,
	getMaxFixRetries,
	hydrateFixState,
	incrementFixRetry,
	loadFixState,
	markCompleted,
	markFailed,
	markRunning,
	markStageComplete,
	resetFixStagesFrom,
	saveFixState,
	shouldRunFixStage
} from './lib/fix-state.mjs';
import {
	assignPr,
	commentPr,
	commitAndCreatePr,
	getPrDiff,
	hasNoChanges,
	setupGitBranches,
	verifyBuildTest
} from './lib/git.mjs';
import {
	fetchGitHubIssue,
	isIssueOpen,
	parseIssueRef,
	verifyGhAuth,
	writeIssueMarkdown
} from './lib/pr-github.mjs';
import {
	artifactExists,
	ensureRunDir,
	epicBranchName,
	fixBranchName,
	fixLog,
	issuePathForRun,
	readPromptTemplate,
	runDir,
	slugify
} from './lib/utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const CODE_BLOCKER_PATTERNS = [
	/src\//i,
	/test/i,
	/build/i,
	/lint/i,
	/typescript/i,
	/\.ts\b/i,
	/controller/i,
	/queries/i,
	/repo/i
];

class RestartFixError extends Error {
	constructor(fromStage) {
		super(`Restart fix from stage: ${fromStage}`);
		this.name = 'RestartFixError';
		this.fromStage = fromStage;
	}
}

function blockersTouchCode(blockers) {
	const text = (blockers || []).join('\n');
	return CODE_BLOCKER_PATTERNS.some((re) => re.test(text));
}

function parseArgs(argv) {
	const args = {
		pb: null,
		task: null,
		githubIssue: null,
		assignee: process.env.GITHUB_ASSIGNEE || null,
		fromStage: null,
		resume: false,
		dryRun: false,
		background: false,
		maxRetries: null,
		baseBranch: process.env.EPIC_BASE_BRANCH || 'main'
	};

	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--pb') args.pb = argv[++i];
		else if (a === '--task') args.task = argv[++i];
		else if (a === '--github-issue') args.githubIssue = argv[++i];
		else if (a === '--assignee') args.assignee = argv[++i];
		else if (a === '--from-stage') args.fromStage = argv[++i];
		else if (a === '--resume') args.resume = true;
		else if (a === '--dry-run') args.dryRun = true;
		else if (a === '--background') args.background = true;
		else if (a === '--max-retries') args.maxRetries = Number(argv[++i]);
		else if (a === '--base-branch') args.baseBranch = argv[++i];
		else if (a === '--help' || a === '-h') {
			printHelp();
			process.exit(0);
		}
	}

	return args;
}

function printHelp() {
	console.log(`Usage: node .cursor/automation/run-fix.mjs \\
  --pb PB-1.700.2 \\
  --task login-timeout \\
  --github-issue 456|https://github.com/org/repo/issues/456 \\
  [--assignee github-user] \\
  [--from-stage git|fix|pr|review] \\
  [--resume] [--dry-run] [--background] \\
  [--max-retries N]

Bugfix di epic dari GitHub issue — tanpa PRD.`);
}

function validateArgs(args) {
	if (!args.pb) throw new Error('--pb is required');
	if (!args.task) throw new Error('--task is required');
	if (!args.resume && !args.githubIssue && !args.dryRun) {
		throw new Error('--github-issue is required (kecuali --resume dengan issue.md yang ada)');
	}
	if (args.fromStage && !FIX_STAGES.includes(args.fromStage)) {
		throw new Error(`Invalid --from-stage. Use: ${FIX_STAGES.join('|')}`);
	}
	if (args.maxRetries != null && Number.isNaN(args.maxRetries)) {
		throw new Error('--max-retries must be a number');
	}
}

function resolveIssueContext(args, runPath) {
	const issueFile = issuePathForRun(runPath);

	if (args.resume && existsSync(issueFile) && !args.githubIssue) {
		fixLog(runPath, '[fix] resume — pakai issue.md yang ada');
		return { issueFile, issueNumber: null, issueUrl: null, issue: null };
	}

	const issueNumber = parseIssueRef(args.githubIssue);
	const issue = fetchGitHubIssue(issueNumber, REPO_ROOT, args.dryRun);

	if (!args.dryRun && !isIssueOpen(issue)) {
		throw new Error(`GitHub issue #${issueNumber} tidak OPEN (state=${issue.state})`);
	}

	writeIssueMarkdown(issue, issueFile, args.dryRun);
	fixLog(runPath, `[fix] issue #${issue.number} disimpan ke issue.md`);

	return {
		issueFile,
		issueNumber: issue.number,
		issueUrl: issue.url,
		issue
	};
}

async function stageGit(ctx, args, state) {
	console.log('\n--- Stage 0: Git + GitHub issue ---');
	const issueCtx = resolveIssueContext(args, ctx.runPath);
	state.githubIssueNumber = issueCtx.issueNumber ?? state.githubIssueNumber;
	state.githubIssueUrl = issueCtx.issueUrl ?? state.githubIssueUrl;
	state.issuePath = issueCtx.issueFile;
	saveFixState(ctx.runPath, state);

	setupGitBranches(ctx);
}

async function stageFix(ctx, args, state, lastError = null) {
	console.log('\n--- Stage 1: Fix (debugger) ---');
	const { summary } = await runFixAgent({
		...ctx,
		issuePath: state.issuePath || ctx.issuePath,
		githubIssueNumber: state.githubIssueNumber,
		githubIssueUrl: state.githubIssueUrl,
		errorMessage: lastError,
		dryRun: args.dryRun
	});
	state.fixSummary = summary;
	saveFixState(ctx.runPath, state);

	if (!args.dryRun) {
		if (hasNoChanges(ctx.epicBranch, ctx.repoRoot)) {
			throw new Error(
				'Fix agent tidak menghasilkan perubahan kode: working tree bersih dan tidak ada commit baru ' +
					`di atas ${ctx.epicBranch}. Agent WAJIB benar-benar meng-edit file untuk memperbaiki bug ` +
					'(bukan hanya analisis). Baca ulang Reproduction/Expected/Actual di issue, temukan file ' +
					'penyebab, lalu terapkan perubahan konkret.'
			);
		}

		console.log('\n--- Verify build/test ---');
		verifyBuildTest(ctx.repoRoot, false);
	}
}

async function stagePr(ctx, state) {
	console.log('\n--- Stage 2: Commit & PR ---');
	const prUrl = commitAndCreatePr({
		...ctx,
		prKind: 'fix',
		githubIssueNumber: state.githubIssueNumber
	});
	state.prUrl = prUrl;
	saveFixState(ctx.runPath, state);
	console.log(`PR: ${prUrl}`);
	return prUrl;
}

async function stageReview(ctx, state, promptVars, args) {
	console.log('\n--- Stage 3: Review ---');
	if (!state.prUrl && !args.dryRun) {
		throw new Error('No PR URL for review stage');
	}
	promptVars.PR_URL = state.prUrl || 'https://github.com/example/repo/pull/dry-run';
	const prDiffPath = join(ctx.runPath, 'pr.diff');
	if (!args.dryRun) {
		writeFileSync(prDiffPath, getPrDiff(state.prUrl, ctx.repoRoot, args.dryRun), 'utf8');
	}
	promptVars.PR_DIFF_PATH = prDiffPath.replace(/\\/g, '/');

	const prompt = readPromptTemplate(ctx.repoRoot, 'stage-review.md', promptVars);
	runAgent(prompt, {
		repoRoot: ctx.repoRoot,
		runPath: ctx.runPath,
		dryRun: args.dryRun,
		timeoutSec: Number(process.env.STAGE_TIMEOUT_SEC || 3600)
	});

	if (!args.dryRun) {
		if (!artifactExists(ctx.runPath, 'review.json')) {
			throw new Error('Stage review failed: review.json not created');
		}
		const review = JSON.parse(readFileSync(join(ctx.runPath, 'review.json'), 'utf8'));
		state.reviewVerdict = review.verdict;
		saveFixState(ctx.runPath, state);

		if (review.verdict === 'pass') {
			console.log('Review PASS');
			if (args.assignee) {
				assignPr(state.prUrl, args.assignee, ctx.repoRoot, args.dryRun);
				console.log(`Assigned PR to ${args.assignee}`);
			}
			commentPr(
				state.prUrl,
				`Fix pipeline review passed.\n\nFixes #${state.githubIssueNumber || '?'}\n\nNotes:\n${(review.notes || []).map((n) => `- ${n}`).join('\n')}`,
				ctx.repoRoot,
				args.dryRun
			);
		} else {
			const blockers = (review.blockers || []).join('\n- ');
			commentPr(
				state.prUrl,
				`Fix pipeline review **failed**.\n\nBlockers:\n- ${blockers}`,
				ctx.repoRoot,
				args.dryRun
			);
			if (blockersTouchCode(review.blockers)) {
				throw new RestartFixError('fix');
			}
			throw new Error(`Review failed: ${blockers || 'see review.json'}`);
		}
	}
}

async function runFixStageWithRetry(ctx, state, args) {
	const maxForFix = getMaxFixRetries('fix', { maxRetries: args.maxRetries, state });
	let lastError = null;

	while (true) {
		markRunning(state, 'fix');
		saveFixState(ctx.runPath, state);

		try {
			await stageFix(ctx, args, state, lastError);
			markStageComplete(state, 'fix');
			saveFixState(ctx.runPath, state);
			return;
		} catch (err) {
			markFailed(state, 'fix', err);
			saveFixState(ctx.runPath, state);
			fixLog(ctx.runPath, `[fix] stage fix gagal: ${err.message}`);

			const stageRetry = state.stageRetryCount?.fix || 0;
			if (stageRetry >= maxForFix) {
				throw new Error(
					`Stage fix gagal setelah ${stageRetry} retry. Perlu intervensi manusia: ${err.message}`
				);
			}

			incrementFixRetry(state, 'fix');
			lastError = err.message;
			fixLog(ctx.runPath, `[fix] retry fix attempt ${stageRetry + 1}/${maxForFix}`);
			saveFixState(ctx.runPath, state);
		}
	}
}

async function runFixStages(ctx, state, promptVars, args) {
	const stages = [
		{ name: 'git', fn: () => stageGit(ctx, args, state) },
		{ name: 'fix', fn: () => runFixStageWithRetry(ctx, state, args) },
		{
			name: 'pr',
			fn: async () => {
				const prUrl = await stagePr(ctx, state);
				promptVars.PR_URL = prUrl;
			}
		},
		{ name: 'review', fn: () => stageReview(ctx, state, promptVars, args) }
	];

	let restart = true;
	while (restart) {
		restart = false;
		for (const { name, fn } of stages) {
			if (!shouldRunFixStage(name, args.fromStage)) continue;

			if (name === 'fix') {
				try {
					await fn();
				} catch (err) {
					throw err;
				}
				continue;
			}

			markRunning(state, name);
			saveFixState(ctx.runPath, state);
			try {
				await fn();
				markStageComplete(state, name);
				saveFixState(ctx.runPath, state);
			} catch (err) {
				if (err instanceof RestartFixError) {
					resetFixStagesFrom(state, err.fromStage);
					args.fromStage = err.fromStage;
					saveFixState(ctx.runPath, state);
					restart = true;
					fixLog(ctx.runPath, `[fix] restart dari stage ${err.fromStage} setelah review fail`);
					break;
				}
				markFailed(state, name, err);
				saveFixState(ctx.runPath, state);
				throw err;
			}
		}
	}
}

async function runFix(args) {
	verifyGhAuth(REPO_ROOT, args.dryRun);

	const taskSlug = slugify(args.task);
	const epicBranch = epicBranchName(args.pb);
	const taskBranch = fixBranchName(args.pb, taskSlug);
	const runPath = runDir(REPO_ROOT, args.pb, taskSlug);
	const issueFile = issuePathForRun(runPath);
	ensureRunDir(runPath);

	let state = loadFixState(runPath);
	const ctxBase = {
		repoRoot: REPO_ROOT,
		runPath,
		pb: args.pb,
		taskSlug,
		assignee: args.assignee,
		epicBranch,
		taskBranch,
		baseBranch: args.baseBranch,
		issuePath: issueFile,
		dryRun: args.dryRun,
		prKind: 'fix'
	};

	if (args.resume && state) {
		state = hydrateFixState(state, {
			...ctxBase,
			maxRetries: args.maxRetries,
			issuePath: issueFile
		});
		args.assignee = args.assignee || state.assignee;
		if (!args.fromStage && state.stage) {
			args.fromStage = state.stage;
		}
		saveFixState(runPath, state);
	} else {
		if (!args.dryRun && !args.githubIssue) {
			throw new Error('--github-issue wajib untuk run baru');
		}
		state = createInitialFixState({
			...ctxBase,
			maxRetries: args.maxRetries
		});
		saveFixState(runPath, state);
	}

	const ctx = { ...ctxBase };

	const promptVars = {
		PB: args.pb,
		TASK: taskSlug,
		RUN_DIR: runPath.replace(/\\/g, '/'),
		EPIC_BRANCH: epicBranch,
		TASK_BRANCH: taskBranch,
		PR_URL: state.prUrl || '',
		PR_DIFF: ''
	};

	fixLog(runPath, `[fix] started pb=${args.pb} task=${taskSlug} issue=${args.githubIssue || 'resume'}`);

	console.log(`\n=== Fix ${args.pb} / ${taskSlug} ===`);
	console.log(`Epic: ${epicBranch} | Fix branch: ${taskBranch}`);
	console.log(`GitHub issue: ${args.githubIssue || state.githubIssueNumber || '(resume)'}`);
	console.log(`Run dir: ${runPath}`);
	if (args.dryRun) console.log('(dry-run mode)\n');

	if (args.dryRun) {
		for (const stage of FIX_STAGES) {
			if (!shouldRunFixStage(stage, args.fromStage)) continue;
			console.log(`[dry-run] stage: ${stage}`);
		}
		if (args.githubIssue) {
			const issueNumber = parseIssueRef(args.githubIssue);
			const issue = fetchGitHubIssue(issueNumber, REPO_ROOT, true);
			console.log(`[dry-run] issue: #${issue.number} ${issue.title}`);
			writeIssueMarkdown(issue, issueFile, true);
			state.githubIssueNumber = issue.number;
			state.githubIssueUrl = issue.url;
			state.issuePath = issueFile;
		}
		markCompleted(state);
		saveFixState(runPath, state);
		console.log('\n=== Fix dry-run complete ===');
		fixLog(runPath, '[fix] dry-run completed');
		return;
	}

	await runFixStages(ctx, state, promptVars, args);

	markCompleted(state);
	saveFixState(runPath, state);

	console.log('\n=== Fix complete ===');
	if (state.prUrl) console.log(`PR: ${state.prUrl}`);
	fixLog(runPath, '[fix] completed');
}

function spawnBackground(args) {
	const taskSlug = slugify(args.task);
	const runPath = runDir(REPO_ROOT, args.pb, taskSlug);
	ensureRunDir(runPath);
	const logPath = join(runPath, 'fix.log');

	const forwardArgs = process.argv.slice(2).filter((a) => a !== '--background');
	const logFd = openSync(logPath, 'a');
	const child = spawn(process.execPath, [join(__dirname, 'run-fix.mjs'), ...forwardArgs], {
		cwd: REPO_ROOT,
		detached: true,
		stdio: ['ignore', logFd, logFd],
		env: process.env,
		windowsHide: true
	});

	console.log(`Background fix started (pid ${child.pid})`);
	console.log(`Log: ${logPath}`);
	child.unref();
}

async function main() {
	loadConfigEnv();
	const args = parseArgs(process.argv);

	if (args.background) {
		validateArgs(args);
		spawnBackground(args);
		return;
	}

	let runPath = null;

	try {
		validateArgs(args);
		runPath = runDir(REPO_ROOT, args.pb, slugify(args.task));
		await runFix(args);
	} catch (err) {
		console.error('\nFix error:', err.message);
		if (runPath) {
			const state = loadFixState(runPath);
			if (state && state.status !== 'failed') {
				const failedStage = state.stage || state.currentStage || args.fromStage || 'unknown';
				markFailed(state, failedStage, err);
				saveFixState(runPath, state);
			}
		}
		process.exit(1);
	}
}

main();
