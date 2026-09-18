#!/usr/bin/env node
/**
 * Knitto PR Babysit Loop
 * PR sudah open → triage komentar / CI / merge conflict sampai merge-ready
 * Usage: node .cursor/automation/run-babysit.mjs --pr 123 [--background]
 */
import { spawn } from 'node:child_process';
import { existsSync, openSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	appendBabysitSummary,
	commitAndPushIfNeeded,
	mergeBaseBranch,
	runBabysitAgent
} from './babysit-agent.mjs';
import { loadConfigEnv } from './lib/config.mjs';
import {
	getCiPollConfig,
	getMaxBabysitRetries,
	hydrateBabysitState,
	initBabysitState,
	isMergeReady,
	loadBabysitState,
	markBabysitCompleted,
	markBabysitFailed,
	markBabysitRunning,
	saveBabysitState,
	updateBabysitSnapshot
} from './lib/babysit-state.mjs';
import { git } from './lib/git.mjs';
import {
	fetchPrView,
	fetchUnresolvedReviewThreads,
	isMergeConflict,
	isPrOpen,
	parsePrRef,
	pollCi,
	resolvePrByHead,
	rollupCiStatus,
	validateBranchNaming,
	verifyGhAuth
} from './lib/pr-github.mjs';
import {
	babysitLog,
	ensureRunDir,
	epicBranchName,
	runDir,
	slugify,
	taskBranchName
} from './lib/utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

function parseArgs(argv) {
	const args = {
		pr: null,
		pb: null,
		task: null,
		dryRun: false,
		background: false,
		maxRetries: null
	};

	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--pr') args.pr = argv[++i];
		else if (a === '--pb') args.pb = argv[++i];
		else if (a === '--task') args.task = argv[++i];
		else if (a === '--dry-run') args.dryRun = true;
		else if (a === '--background') args.background = true;
		else if (a === '--max-retries') args.maxRetries = Number(argv[++i]);
		else if (a === '--help' || a === '-h') {
			printHelp();
			process.exit(0);
		}
	}

	return args;
}

function printHelp() {
	console.log(`Usage: node .cursor/automation/run-babysit.mjs \\
  --pr 123|https://github.com/org/repo/pull/123 \\
  [--background] [--dry-run] [--max-retries N]

Atau:

  --pb PB-1.700.2 --task migrate-node [--background]

Babysit loop: komentar unresolved, CI fail, merge conflict → merge-ready (tanpa auto-merge).`);
}

function validateArgs(args) {
	const hasPr = Boolean(args.pr);
	const hasPbTask = Boolean(args.pb && args.task);
	if (!hasPr && !hasPbTask) {
		throw new Error('Wajib --pr ATAU (--pb + --task)');
	}
	if (args.pb && !args.task) throw new Error('--task wajib bersama --pb');
	if (args.task && !args.pb) throw new Error('--pb wajib bersama --task');
	if (args.maxRetries != null && Number.isNaN(args.maxRetries)) {
		throw new Error('--max-retries must be a number');
	}
}

function checkoutTaskBranch(repoRoot, taskBranch, dryRun) {
	git('fetch origin', repoRoot, dryRun);
	git(`checkout ${taskBranch}`, repoRoot, dryRun);
	git(`pull origin ${taskBranch}`, repoRoot, dryRun);
}

function pickAction(prView, ciStatus, unresolvedCount) {
	if (isMergeConflict(prView)) {
		return { type: 'merge_conflict', label: 'resolve merge conflict' };
	}
	if (ciStatus === 'failure') {
		return { type: 'ci_failure', label: 'fix CI failure' };
	}
	if (unresolvedCount > 0) {
		return { type: 'review_comments', label: 'address unresolved review comments' };
	}
	if (ciStatus === 'pending') {
		return { type: 'wait_ci', label: 'wait for CI' };
	}
	return { type: 'none', label: 'no action needed' };
}

async function resolvePrContext(args) {
	const taskSlug = args.task ? slugify(args.task) : null;
	const epicBranch = args.pb ? epicBranchName(args.pb) : null;
	const taskBranch = args.pb && taskSlug ? taskBranchName(args.pb, taskSlug) : null;

	let prNumber;
	let prView;

	if (args.pr) {
		prNumber = parsePrRef(args.pr);
		prView = fetchPrView(prNumber, REPO_ROOT, args.dryRun);
	} else {
		if (args.dryRun) {
			prView = {
				...fetchPrView(123, REPO_ROOT, true),
				headRefName: taskBranch,
				baseRefName: epicBranch,
				number: 123
			};
			prNumber = 123;
		} else {
			prView = resolvePrByHead(taskBranch, REPO_ROOT, false);
			prNumber = prView.number;
		}
	}

	if (!isPrOpen(prView)) {
		throw new Error(`PR #${prNumber} tidak OPEN (state=${prView.state})`);
	}

	const derived = validateBranchNaming(
		prView,
		args.pb,
		taskSlug,
		epicBranch || prView.baseRefName,
		taskBranch || prView.headRefName
	);

	return {
		pb: args.pb || derived.pb,
		taskSlug: taskSlug || derived.taskSlug,
		epicBranch: epicBranch || derived.epicBranch,
		taskBranch: taskBranch || derived.taskBranch,
		prNumber,
		prUrl: prView.url,
		prView
	};
}

function assertPipelineRan(runPath, dryRun) {
	if (dryRun) return;
	if (!existsSync(join(runPath, 'state.json'))) {
		throw new Error(
			`Pipeline belum pernah jalan — state.json tidak ada di ${runPath}. Jalankan run-pipeline.mjs dulu.`
		);
	}
}

async function runBabysitLoop(ctx, state, args) {
	const maxRetries = state.maxRetries ?? getMaxBabysitRetries({ maxRetries: args.maxRetries });
	const pollConfig = getCiPollConfig();
	let iteration = 0;

	while (iteration < maxRetries) {
		iteration++;
		const prView = fetchPrView(ctx.prNumber, REPO_ROOT, args.dryRun);
		const unresolved = fetchUnresolvedReviewThreads(ctx.prNumber, REPO_ROOT, args.dryRun);
		const ciStatus = rollupCiStatus(prView.statusCheckRollup);
		const mergeable = !isMergeConflict(prView);

		updateBabysitSnapshot(state, {
			prUrl: prView.url,
			prNumber: ctx.prNumber,
			mergeable,
			ciStatus,
			unresolvedComments: unresolved.length
		});
		markBabysitRunning(state);
		saveBabysitState(ctx.runPath, state);

		babysitLog(
			ctx.runPath,
			`[babysit] iterasi ${iteration}/${maxRetries} mergeable=${mergeable} ci=${ciStatus} unresolved=${unresolved.length}`
		);

		if (isMergeReady({ mergeable, ciStatus, unresolvedComments: unresolved.length })) {
			markBabysitCompleted(state, 'PR merge-ready');
			saveBabysitState(ctx.runPath, state);
			babysitLog(ctx.runPath, '[babysit] selesai — PR merge-ready');
			return;
		}

		const action = pickAction(prView, ciStatus, unresolved.length);

		if (args.dryRun) {
			console.log(
				`[dry-run] iter ${iteration}: mergeable=${mergeable}, ci=${ciStatus}, unresolved=${unresolved.length}`
			);
			console.log(`[dry-run] aksi rencana: ${action.label}`);
			markBabysitCompleted(state, `[dry-run] ${action.label}`);
			saveBabysitState(ctx.runPath, state);
			babysitLog(ctx.runPath, `[babysit] dry-run selesai — rencana: ${action.label}`);
			return;
		}

		if (action.type === 'wait_ci') {
			state.lastAction = action.label;
			saveBabysitState(ctx.runPath, state);
			if (args.dryRun) {
				return;
			}
			try {
				const polled = await pollCi(ctx.prNumber, REPO_ROOT, {
					intervalMs: pollConfig.intervalMs,
					timeoutMs: pollConfig.timeoutMs,
					dryRun: false,
					onPoll: (status) => babysitLog(ctx.runPath, `[babysit] CI poll: ${status}`)
				});
				state.ciStatus = polled;
				state.lastAction = `waited CI → ${polled}`;
				saveBabysitState(ctx.runPath, state);
			} catch (e) {
				state.retryCount = (state.retryCount || 0) + 1;
				babysitLog(ctx.runPath, `[babysit] CI poll timeout: ${e.message}`);
			}
			continue;
		}

		if (action.type === 'none') {
			markBabysitCompleted(state, 'no blocking issues');
			saveBabysitState(ctx.runPath, state);
			return;
		}

		state.retryCount = (state.retryCount || 0) + 1;
		state.lastAction = action.label;
		saveBabysitState(ctx.runPath, state);

		if (action.type === 'merge_conflict' && !args.dryRun) {
			try {
				mergeBaseBranch(ctx);
			} catch (e) {
				babysitLog(ctx.runPath, `[babysit] merge base gagal: ${e.message} — lanjut agent`);
			}
		}

		const agentCtx = {
			...ctx,
			mergeable,
			ciStatus,
			unresolvedComments: unresolved,
			actionType: action.type,
			dryRun: args.dryRun
		};

		const { summary } = await runBabysitAgent(agentCtx);
		appendBabysitSummary(ctx.runPath, iteration, summary, action.label);

		if (!args.dryRun) {
			commitAndPushIfNeeded(ctx, summary);
			try {
				await pollCi(ctx.prNumber, REPO_ROOT, {
					intervalMs: pollConfig.intervalMs,
					timeoutMs: pollConfig.timeoutMs,
					dryRun: false,
					onPoll: (status) => babysitLog(ctx.runPath, `[babysit] post-push CI: ${status}`)
				});
			} catch (e) {
				babysitLog(ctx.runPath, `[babysit] post-push CI poll: ${e.message}`);
			}
		}
	}

	throw new Error(
		`Babysit gagal setelah ${maxRetries} iterasi. Eskalasi ke human reviewer — cek babysit.log dan PR ${ctx.prUrl}`
	);
}

async function runBabysit(args) {
	verifyGhAuth(REPO_ROOT, args.dryRun);

	const prCtx = await resolvePrContext(args);
	const { pb, taskSlug, epicBranch, taskBranch, prNumber, prUrl } = prCtx;

	const runPath = runDir(REPO_ROOT, pb, taskSlug);
	ensureRunDir(runPath);
	assertPipelineRan(runPath, args.dryRun);

	if (!args.dryRun) {
		checkoutTaskBranch(REPO_ROOT, taskBranch, false);
	}

	const existing = loadBabysitState(runPath);
	const maxRetries = getMaxBabysitRetries({ maxRetries: args.maxRetries });
	const ctx = {
		repoRoot: REPO_ROOT,
		runPath,
		pb,
		taskSlug,
		epicBranch,
		taskBranch,
		prNumber,
		prUrl,
		dryRun: args.dryRun
	};

	let state = existing
		? hydrateBabysitState(existing, { ...ctx, maxRetries, prUrl, prNumber })
		: initBabysitState(null, { ...ctx, maxRetries, prUrl, prNumber });

	state.maxRetries = maxRetries;
	markBabysitRunning(state, 'babysit started');
	saveBabysitState(runPath, state);

	babysitLog(runPath, `[babysit] started pb=${pb} task=${taskSlug} pr=${prUrl}`);

	console.log(`\n=== Babysit ${pb} / ${taskSlug} ===`);
	console.log(`PR: ${prUrl} (#${prNumber})`);
	console.log(`Branch: ${taskBranch} → ${epicBranch}`);
	console.log(`Run dir: ${runPath}`);
	console.log(`Max retries: ${maxRetries}`);
	if (args.dryRun) console.log('(dry-run mode)\n');

	await runBabysitLoop(ctx, state, args);

	if (state.status !== 'completed') {
		markBabysitCompleted(state, state.lastAction || 'PR merge-ready');
		saveBabysitState(runPath, state);
	}

	console.log('\n=== Babysit complete ===');
	console.log(`PR: ${prUrl}`);
	babysitLog(runPath, '[babysit] completed');
}

function spawnBackground(args) {
	const forwardArgs = process.argv.slice(2).filter((a) => a !== '--background');
	let runPath = join(REPO_ROOT, '.cursor', 'runs', '_babysit');

	if (args.pb && args.task) {
		runPath = runDir(REPO_ROOT, args.pb, slugify(args.task));
	} else if (args.pr && !args.dryRun) {
		try {
			const prNumber = parsePrRef(args.pr);
			const prView = fetchPrView(prNumber, REPO_ROOT, false);
			const derived = validateBranchNaming(
				prView,
				null,
				null,
				prView.baseRefName,
				prView.headRefName
			);
			runPath = runDir(REPO_ROOT, derived.pb, derived.taskSlug);
		} catch {
			// fallback _babysit
		}
	}

	ensureRunDir(runPath);
	const logPath = join(runPath, 'babysit.log');

	const logFd = openSync(logPath, 'a');
	const child = spawn(process.execPath, [join(__dirname, 'run-babysit.mjs'), ...forwardArgs], {
		cwd: REPO_ROOT,
		detached: true,
		stdio: ['ignore', logFd, logFd],
		env: process.env,
		windowsHide: true
	});

	console.log(`Background babysit started (pid ${child.pid})`);
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
	let state = null;

	try {
		validateArgs(args);
		const prCtx = args.dryRun && !args.pb
			? null
			: await resolvePrContext(args).catch(() => null);
		if (prCtx) {
			runPath = runDir(REPO_ROOT, prCtx.pb, prCtx.taskSlug);
		} else if (args.pb && args.task) {
			runPath = runDir(REPO_ROOT, args.pb, slugify(args.task));
		}
		await runBabysit(args);
	} catch (err) {
		console.error('\nBabysit error:', err.message);
		if (runPath) {
			state = loadBabysitState(runPath);
			if (state) {
				markBabysitFailed(state, err);
				saveBabysitState(runPath, state);
			}
		}
		process.exit(1);
	}
}

main();
