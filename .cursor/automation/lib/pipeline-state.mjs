import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const STAGES = ['git', 'plan', 'dev', 'pr', 'review'];

const DEFAULT_MAX_RETRIES = {
	git: 2,
	plan: 2,
	dev: 3,
	pr: 2,
	review: 2
};

export const HEAL_SUBAGENTS = {
	git: 'knitto-agent-feature',
	plan: 'knitto-agent-planner',
	dev: 'knitto-agent-feature',
	pr: 'knitto-agent-feature',
	review: 'knitto-agent-reviewer'
};

export function loadState(runPath) {
	const statePath = join(runPath, 'state.json');
	if (!existsSync(statePath)) return null;
	return JSON.parse(readFileSync(statePath, 'utf8'));
}

export function saveState(runPath, state) {
	mkdirSync(runPath, { recursive: true });
	state.updatedAt = new Date().toISOString();
	writeFileSync(join(runPath, 'state.json'), JSON.stringify(state, null, 2));
}

export function createInitialState(ctx) {
	return {
		pb: ctx.pb,
		task: ctx.taskSlug,
		assignee: ctx.assignee,
		epicBranch: ctx.epicBranch,
		taskBranch: ctx.taskBranch,
		baseBranch: ctx.baseBranch,
		runPath: ctx.runPath,
		prdPath: ctx.prdPath,
		currentStage: null,
		stage: null,
		completedStages: [],
		prUrl: null,
		reviewVerdict: null,
		status: 'running',
		error: null,
		retryCount: 0,
		stageRetryCount: {},
		maxRetries: ctx.maxHealRetries ?? null,
		lastHealAt: null,
		healSummary: null,
		finishedAt: null,
		startedAt: new Date().toISOString(),
		updatedAt: new Date().toISOString()
	};
}

export function hydrateState(existing, ctx) {
	const state = {
		...existing,
		runPath: ctx.runPath,
		prdPath: ctx.prdPath,
		assignee: ctx.assignee || existing.assignee
	};

	if (state.status === 'failed') {
		state.status = 'running';
		state.retryCount = 0;
		state.stageRetryCount = {};
		state.error = null;
		state.finishedAt = null;
		state.healSummary = null;
		state.lastHealAt = null;
	}

	return state;
}

export function markRunning(state, stage) {
	state.status = 'running';
	state.stage = stage;
	state.currentStage = stage;
	state.error = null;
	state.finishedAt = null;
}

export function markStageComplete(state, stage) {
	if (!state.completedStages) state.completedStages = [];
	if (!state.completedStages.includes(stage)) {
		state.completedStages.push(stage);
	}
	state.currentStage = stage;
	state.stage = stage;
}

export function markFailed(state, stage, error) {
	state.status = 'failed';
	state.stage = stage;
	state.currentStage = stage;
	state.error = typeof error === 'string' ? error : error?.message || String(error);
	state.finishedAt = null;
}

export function markCompleted(state) {
	state.status = 'completed';
	state.error = null;
	state.finishedAt = new Date().toISOString();
}

export function incrementHeal(state, stage) {
	if (!state.stageRetryCount) state.stageRetryCount = {};
	state.stageRetryCount[stage] = (state.stageRetryCount[stage] || 0) + 1;
	state.retryCount = (state.retryCount || 0) + 1;
	state.lastHealAt = new Date().toISOString();
}

export function getMaxRetriesForStage(stage, options = {}) {
	const globalOverride = options.maxHealRetries;
	if (globalOverride != null) return Number(globalOverride);

	const envStage = process.env[`HEAL_MAX_RETRIES_${stage.toUpperCase()}`];
	if (envStage != null && envStage !== '') return Number(envStage);

	const envGlobal = process.env.HEAL_MAX_RETRIES;
	if (envGlobal != null && envGlobal !== '') return Number(envGlobal);

	if (options.state?.maxRetries != null) {
		return options.state.maxRetries;
	}

	return DEFAULT_MAX_RETRIES[stage] ?? 2;
}

export function resetStagesFrom(state, fromStage) {
	const idx = STAGES.indexOf(fromStage);
	if (idx === -1) return state;
	state.completedStages = (state.completedStages || []).filter((s) => STAGES.indexOf(s) < idx);
	return state;
}

export function isOrchestratorSuccess(state) {
	return state?.status === 'completed';
}

export function isOrchestratorFailure(state) {
	return state?.status === 'failed';
}

export function isOrchestratorBabysitSuccess(state) {
	return state?.mode === 'babysit' && state?.status === 'completed';
}

export function isOrchestratorBabysitFailure(state) {
	return state?.mode === 'babysit' && state?.status === 'failed';
}

export function isOrchestratorFixSuccess(state) {
	return state?.mode === 'fix' && state?.status === 'completed';
}

export function isOrchestratorFixFailure(state) {
	return state?.mode === 'fix' && state?.status === 'failed';
}
