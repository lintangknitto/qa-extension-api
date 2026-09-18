import {
	loadState,
	saveState,
	markRunning,
	markStageComplete,
	markFailed,
	markCompleted,
	resetStagesFrom
} from './pipeline-state.mjs';

export const FIX_MODE = 'fix';
export const FIX_STAGES = ['git', 'fix', 'pr', 'review'];

export const FIX_SUBAGENTS = {
	git: 'knitto-agent-feature',
	fix: 'knitto-agent-debugger',
	pr: 'knitto-agent-feature',
	review: 'knitto-agent-reviewer'
};

const DEFAULT_FIX_MAX_RETRIES = {
	git: 2,
	fix: 3,
	pr: 2,
	review: 2
};

export function getMaxFixRetries(stage, options = {}) {
	if (options.maxRetries != null) return Number(options.maxRetries);

	const envStage = process.env[`FIX_MAX_RETRIES_${stage.toUpperCase()}`];
	if (envStage != null && envStage !== '') return Number(envStage);

	const envGlobal = process.env.FIX_MAX_RETRIES;
	if (envGlobal != null && envGlobal !== '') return Number(envGlobal);

	if (options.state?.maxRetries != null) return options.state.maxRetries;

	return DEFAULT_FIX_MAX_RETRIES[stage] ?? 2;
}

export function fixStageIndex(stage) {
	return FIX_STAGES.indexOf(stage);
}

export function shouldRunFixStage(stage, fromStage) {
	if (!fromStage) return true;
	return fixStageIndex(stage) >= fixStageIndex(fromStage);
}

export function resetFixStagesFrom(state, fromStage) {
	const idx = FIX_STAGES.indexOf(fromStage);
	if (idx === -1) return state;
	state.completedStages = (state.completedStages || []).filter(
		(s) => FIX_STAGES.indexOf(s) < idx
	);
	return state;
}

export function createInitialFixState(ctx) {
	const now = new Date().toISOString();
	return {
		mode: FIX_MODE,
		pb: ctx.pb,
		task: ctx.taskSlug,
		assignee: ctx.assignee,
		epicBranch: ctx.epicBranch,
		taskBranch: ctx.taskBranch,
		baseBranch: ctx.baseBranch,
		runPath: ctx.runPath,
		issuePath: ctx.issuePath,
		prKind: 'fix',
		githubIssueNumber: ctx.githubIssueNumber ?? null,
		githubIssueUrl: ctx.githubIssueUrl ?? null,
		currentStage: null,
		stage: null,
		completedStages: [],
		prUrl: null,
		reviewVerdict: null,
		status: 'running',
		error: null,
		retryCount: 0,
		stageRetryCount: {},
		maxRetries: ctx.maxRetries ?? getMaxFixRetries('fix'),
		lastFixAt: null,
		fixSummary: null,
		finishedAt: null,
		startedAt: now,
		updatedAt: now
	};
}

export function hydrateFixState(existing, ctx) {
	const state = {
		...createInitialFixState(ctx),
		...existing,
		mode: FIX_MODE,
		runPath: ctx.runPath,
		issuePath: ctx.issuePath,
		assignee: ctx.assignee || existing.assignee,
		githubIssueNumber: ctx.githubIssueNumber ?? existing.githubIssueNumber,
		githubIssueUrl: ctx.githubIssueUrl ?? existing.githubIssueUrl,
		prKind: 'fix'
	};

	if (state.status === 'failed') {
		state.status = 'running';
		state.retryCount = 0;
		state.stageRetryCount = {};
		state.error = null;
		state.finishedAt = null;
		state.fixSummary = null;
		state.lastFixAt = null;
	}

	return state;
}

export function incrementFixRetry(state, stage) {
	if (!state.stageRetryCount) state.stageRetryCount = {};
	state.stageRetryCount[stage] = (state.stageRetryCount[stage] || 0) + 1;
	state.retryCount = (state.retryCount || 0) + 1;
	state.lastFixAt = new Date().toISOString();
}

export function loadFixState(runPath) {
	return loadState(runPath);
}

export function saveFixState(runPath, state) {
	saveState(runPath, state);
}

export {
	markRunning,
	markStageComplete,
	markFailed,
	markCompleted,
	resetStagesFrom
};

export function isOrchestratorFixSuccess(state) {
	return state?.mode === FIX_MODE && state?.status === 'completed';
}

export function isOrchestratorFixFailure(state) {
	return state?.mode === FIX_MODE && state?.status === 'failed';
}
