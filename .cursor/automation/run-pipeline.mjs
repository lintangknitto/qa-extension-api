#!/usr/bin/env node
/**
 * Knitto Cursor CLI Dev Pipeline (server)
 * PRD di PC (docs/pb/...) → plan → dev → PR → review
 * Usage: node .cursor/automation/run-pipeline.mjs --pb PB-1.700.3 --task slug
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, openSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHeal } from './heal-agent.mjs';
import { runAgent } from './lib/agent.mjs';
import {
	assignPr,
	commentPr,
	commitAndCreatePr,
	getPrDiff,
	setupGitBranches,
	verifyBuildTest
} from './lib/git.mjs';
import {
	createInitialState,
	getMaxRetriesForStage,
	hydrateState,
	loadState,
	markCompleted,
	markFailed,
	markRunning,
	markStageComplete,
	resetStagesFrom,
	saveState
} from './lib/pipeline-state.mjs';
import {
	artifactExists,
	ensureRunDir,
	epicBranchName,
	log,
	prdPath,
	readPromptTemplate,
	runDir,
	shouldRunStage,
	slugify,
	STAGES
} from './lib/utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

class RestartPipelineError extends Error {
	constructor(fromStage) {
		super(`Restart pipeline from stage: ${fromStage}`);
		this.name = 'RestartPipelineError';
		this.fromStage = fromStage;
	}
}

function loadConfigEnv() {
	const configPath = join(__dirname, 'config.env');
	if (!existsSync(configPath)) return;
	const lines = readFileSync(configPath, 'utf8').split('\n');
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

function parseArgs(argv) {
	const args = {
		pb: null,
		task: null,
		assignee: process.env.GITHUB_ASSIGNEE || null,
		fromStage: null,
		resume: false,
		dryRun: false,
		background: false,
		noHeal: false,
		maxHealRetries: null,
		baseBranch: process.env.EPIC_BASE_BRANCH || 'main'
	};

	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--pb') args.pb = argv[++i];
		else if (a === '--task') args.task = argv[++i];
		else if (a === '--assignee') args.assignee = argv[++i];
		else if (a === '--from-stage') args.fromStage = argv[++i];
		else if (a === '--resume') args.resume = true;
		else if (a === '--dry-run') args.dryRun = true;
		else if (a === '--background') args.background = true;
		else if (a === '--no-heal') args.noHeal = true;
		else if (a === '--max-heal-retries') args.maxHealRetries = Number(argv[++i]);
		else if (a === '--base-branch') args.baseBranch = argv[++i];
		else if (a === '--help' || a === '-h') {
			printHelp();
			process.exit(0);
		}
	}

	return args;
}

function printHelp() {
	console.log(`Usage: node .cursor/automation/run-pipeline.mjs \\
  --pb PB-1.700.3 \\
  --task user-history-endpoint \\
  [--assignee github-user] \\
  [--from-stage git|plan|dev|pr|review] \\
  [--resume] [--dry-run] [--background] \\
  [--no-heal] [--max-heal-retries N]

PRD must exist at docs/pb/{PB}/{task}/prd.md (committed from PC).

Heal flags:
  --no-heal            Fail fast tanpa retry otomatis
  --max-heal-retries N Override batas heal semua stage`);
}

function validateArgs(args) {
	if (!args.pb) throw new Error('--pb is required');
	if (!args.task) throw new Error('--task is required');
	if (args.fromStage && !STAGES.includes(args.fromStage)) {
		throw new Error(`Invalid --from-stage. Use: ${STAGES.join('|')}`);
	}
	if (args.maxHealRetries != null && Number.isNaN(args.maxHealRetries)) {
		throw new Error('--max-heal-retries must be a number');
	}
}

function assertPrdExists(repoRoot, pb, taskSlug, dryRun) {
	if (dryRun) return;
	const path = prdPath(repoRoot, pb, taskSlug);
	if (!existsSync(path)) {
		throw new Error(
			`PRD not found: ${path}\n` +
				'Write PRD on PC, commit to epic branch, push, then git pull on server.\n' +
				'See .cursor/automation/pc-workflow.md'
		);
	}
}

async function stageGit(ctx, args) {
	console.log('\n--- Stage 0: Git setup ---');
	setupGitBranches(ctx);
	if (!args.dryRun) {
		assertPrdExists(ctx.repoRoot, ctx.pb, ctx.taskSlug, false);
	}
}

async function stagePlan(ctx, state, promptVars, args) {
	console.log('\n--- Stage 1: Plan + API design ---');
	const prompt = readPromptTemplate(ctx.repoRoot, 'stage-plan.md', promptVars);
	runAgent(prompt, {
		repoRoot: ctx.repoRoot,
		runPath: ctx.runPath,
		dryRun: args.dryRun,
		timeoutSec: Number(process.env.STAGE_TIMEOUT_SEC || 3600)
	});
	if (!args.dryRun) {
		if (!artifactExists(ctx.runPath, 'plan.md')) throw new Error('Stage plan failed: plan.md not created');
		if (!artifactExists(ctx.runPath, 'api-design.md')) {
			throw new Error('Stage plan failed: api-design.md not created');
		}
	}
}

async function stageDev(ctx, promptVars, args) {
	console.log('\n--- Stage 2: Development ---');
	const prompt = readPromptTemplate(ctx.repoRoot, 'stage-dev.md', promptVars);
	runAgent(prompt, {
		repoRoot: ctx.repoRoot,
		runPath: ctx.runPath,
		dryRun: args.dryRun,
		timeoutSec: Number(process.env.STAGE_TIMEOUT_SEC || 3600)
	});
	console.log('\n--- Verify build/test ---');
	verifyBuildTest(ctx.repoRoot, args.dryRun);
}

async function stagePr(ctx, state) {
	console.log('\n--- Stage 3: Commit & PR ---');
	const prUrl = commitAndCreatePr(ctx);
	state.prUrl = prUrl;
	console.log(`PR: ${prUrl}`);
	return prUrl;
}

async function stageReview(ctx, state, promptVars, args) {
	console.log('\n--- Stage 4: Review ---');
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
		saveState(ctx.runPath, state);

		if (review.verdict === 'pass') {
			console.log('Review PASS');
			if (args.assignee) {
				assignPr(state.prUrl, args.assignee, ctx.repoRoot, args.dryRun);
				console.log(`Assigned PR to ${args.assignee}`);
			}
			commentPr(
				state.prUrl,
				`Pipeline review passed.\n\nNotes:\n${(review.notes || []).map((n) => `- ${n}`).join('\n')}`,
				ctx.repoRoot,
				args.dryRun
			);
		} else {
			const blockers = (review.blockers || []).join('\n- ');
			commentPr(
				state.prUrl,
				`Pipeline review **failed**.\n\nBlockers:\n- ${blockers}`,
				ctx.repoRoot,
				args.dryRun
			);
			throw new Error(`Review failed: ${blockers || 'see review.json'}`);
		}
	}
}

async function runStageWithHeal(stageName, stageFn, ctx, state, args) {
	const maxForStage = getMaxRetriesForStage(stageName, {
		maxHealRetries: args.maxHealRetries,
		state
	});

	while (true) {
		markRunning(state, stageName);
		saveState(ctx.runPath, state);

		try {
			await stageFn();
			markStageComplete(state, stageName);
			saveState(ctx.runPath, state);
			return;
		} catch (err) {
			markFailed(state, stageName, err);
			saveState(ctx.runPath, state);
			log(ctx.runPath, `[pipeline] stage ${stageName} gagal: ${err.message}`);

			const stageRetry = state.stageRetryCount?.[stageName] || 0;
			if (args.noHeal || stageRetry >= maxForStage) {
				const msg = args.noHeal
					? err.message
					: `Stage ${stageName} gagal setelah ${stageRetry} heal attempt. Perlu intervensi manusia: ${err.message}`;
				throw new Error(msg);
			}

			const healResult = await runHeal({
				ctx: { ...ctx, maxHealRetries: args.maxHealRetries },
				stage: stageName,
				error: err,
				state,
				runPath: ctx.runPath
			});
			saveState(ctx.runPath, state);

			if (healResult.resumeFrom && healResult.resumeFrom !== stageName) {
				resetStagesFrom(state, healResult.resumeFrom);
				args.fromStage = healResult.resumeFrom;
				saveState(ctx.runPath, state);
				throw new RestartPipelineError(healResult.resumeFrom);
			}
		}
	}
}

async function runPipelineStages(ctx, state, promptVars, args) {
	const stages = [
		{
			name: 'git',
			fn: () => stageGit(ctx, args)
		},
		{
			name: 'plan',
			fn: () => stagePlan(ctx, state, promptVars, args)
		},
		{
			name: 'dev',
			fn: () => stageDev(ctx, promptVars, args)
		},
		{
			name: 'pr',
			fn: async () => {
				const prUrl = await stagePr(ctx, state);
				promptVars.PR_URL = prUrl;
			}
		},
		{
			name: 'review',
			fn: () => stageReview(ctx, state, promptVars, args)
		}
	];

	let restart = true;
	while (restart) {
		restart = false;
		for (const { name, fn } of stages) {
			if (!shouldRunStage(name, args.fromStage)) continue;
			try {
				await runStageWithHeal(name, fn, ctx, state, args);
			} catch (err) {
				if (err instanceof RestartPipelineError) {
					args.fromStage = err.fromStage;
					restart = true;
					log(ctx.runPath, `[pipeline] restart dari stage ${err.fromStage} setelah heal`);
					break;
				}
				throw err;
			}
		}
	}
}

async function runPipeline(args) {
	const taskSlug = slugify(args.task);
	const epicBranch = epicBranchName(args.pb);
	const taskBranch = `${epicBranch}-${taskSlug}`;
	const runPath = runDir(REPO_ROOT, args.pb, taskSlug);
	const prdFilePath = prdPath(REPO_ROOT, args.pb, taskSlug);
	ensureRunDir(runPath);

	let state = loadState(runPath);
	const ctxBase = {
		repoRoot: REPO_ROOT,
		runPath,
		pb: args.pb,
		taskSlug,
		assignee: args.assignee,
		epicBranch,
		taskBranch,
		baseBranch: args.baseBranch,
		prdPath: prdFilePath,
		dryRun: args.dryRun,
		maxHealRetries: args.maxHealRetries
	};

	if (args.resume && state) {
		state = hydrateState(state, {
			runPath,
			prdPath: prdFilePath,
			assignee: args.assignee || state.assignee
		});
		args.assignee = args.assignee || state.assignee;
		if (!args.fromStage && state.stage) {
			args.fromStage = state.stage;
		}
		if (state.maxRetries == null && args.maxHealRetries != null) {
			state.maxRetries = args.maxHealRetries;
		}
		saveState(runPath, state);
	} else {
		state = createInitialState({
			...ctxBase,
			maxHealRetries: args.maxHealRetries
		});
		saveState(runPath, state);
	}

	const ctx = { ...ctxBase };

	const promptVars = {
		PB: args.pb,
		TASK: taskSlug,
		PRD_PATH: prdFilePath.replace(/\\/g, '/'),
		RUN_DIR: runPath.replace(/\\/g, '/'),
		EPIC_BRANCH: epicBranch,
		TASK_BRANCH: taskBranch,
		PR_URL: state.prUrl || '',
		PR_DIFF: ''
	};

	const healMode = args.noHeal ? 'disabled' : 'enabled';
	log(runPath, `[pipeline] started pb=${args.pb} task=${taskSlug} heal=${healMode}`);

	console.log(`\n=== Pipeline ${args.pb} / ${taskSlug} ===`);
	console.log(`Epic: ${epicBranch} | Task branch: ${taskBranch}`);
	console.log(`PRD: ${prdFilePath}`);
	console.log(`Run dir: ${runPath}`);
	console.log(`Heal: ${healMode}`);
	if (args.dryRun) console.log('(dry-run mode)\n');

	if (shouldRunStage('plan', args.fromStage)) {
		assertPrdExists(REPO_ROOT, args.pb, taskSlug, args.dryRun);
	}

	await runPipelineStages(ctx, state, promptVars, args);

	markCompleted(state);
	saveState(runPath, state);

	console.log('\n=== Pipeline complete ===');
	if (state.prUrl) console.log(`PR: ${state.prUrl}`);
	log(runPath, '[pipeline] completed');
}

function spawnBackground(args) {
	const taskSlug = slugify(args.task);
	const runPath = runDir(REPO_ROOT, args.pb, taskSlug);
	ensureRunDir(runPath);
	const logPath = join(runPath, 'pipeline.log');

	const forwardArgs = process.argv.slice(2).filter((a) => a !== '--background');
	const logFd = openSync(logPath, 'a');
	const child = spawn(process.execPath, [join(__dirname, 'run-pipeline.mjs'), ...forwardArgs], {
		cwd: REPO_ROOT,
		detached: true,
		stdio: ['ignore', logFd, logFd],
		env: process.env,
		windowsHide: true
	});

	console.log(`Background pipeline started (pid ${child.pid})`);
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
		const taskSlug = slugify(args.task);
		runPath = runDir(REPO_ROOT, args.pb, taskSlug);
		await runPipeline(args);
	} catch (err) {
		console.error('\nPipeline error:', err.message);
		if (runPath) {
			state = loadState(runPath);
			if (state && state.status !== 'failed') {
				const failedStage = state.stage || state.currentStage || args.fromStage || 'unknown';
				markFailed(state, failedStage, err);
				saveState(runPath, state);
			}
		}
		process.exit(1);
	}
}

main();
