import { loadState, saveState } from './pipeline-state.mjs';

export const BABYSIT_MODE = 'babysit';

export function getMaxBabysitRetries(options = {}) {
	if (options.maxRetries != null) return Number(options.maxRetries);
	const env = process.env.BABYSIT_MAX_RETRIES;
	if (env != null && env !== '') return Number(env);
	return 5;
}

export function getCiPollConfig() {
	return {
		intervalMs: Number(process.env.BABYSIT_CI_POLL_INTERVAL_MS || 30000),
		timeoutMs: Number(process.env.BABYSIT_CI_POLL_TIMEOUT_MS || 1800000)
	};
}

export function initBabysitState(existingState, ctx) {
	const now = new Date().toISOString();
	const base = existingState || {};

	return {
		...base,
		mode: BABYSIT_MODE,
		pb: ctx.pb,
		task: ctx.taskSlug,
		epicBranch: ctx.epicBranch,
		taskBranch: ctx.taskBranch,
		runPath: ctx.runPath,
		prUrl: ctx.prUrl || base.prUrl || null,
		prNumber: ctx.prNumber ?? base.prNumber ?? null,
		status: 'running',
		error: null,
		mergeable: base.mergeable ?? null,
		ciStatus: base.ciStatus ?? 'pending',
		unresolvedComments: base.unresolvedComments ?? 0,
		retryCount: 0,
		maxRetries: ctx.maxRetries ?? getMaxBabysitRetries({ maxRetries: ctx.maxRetries }),
		lastAction: null,
		startedAt: base.babysitStartedAt || now,
		babysitStartedAt: base.babysitStartedAt || now,
		finishedAt: null,
		updatedAt: now
	};
}

export function hydrateBabysitState(existing, ctx) {
	const state = initBabysitState(existing, ctx);

	if (state.status === 'failed') {
		state.status = 'running';
		state.retryCount = 0;
		state.error = null;
		state.finishedAt = null;
	}

	return state;
}

export function markBabysitRunning(state, lastAction = null) {
	state.status = 'running';
	state.error = null;
	state.finishedAt = null;
	if (lastAction) state.lastAction = lastAction;
}

export function updateBabysitSnapshot(state, snapshot) {
	if (snapshot.mergeable !== undefined) state.mergeable = snapshot.mergeable;
	if (snapshot.ciStatus !== undefined) state.ciStatus = snapshot.ciStatus;
	if (snapshot.unresolvedComments !== undefined) {
		state.unresolvedComments = snapshot.unresolvedComments;
	}
	if (snapshot.prUrl !== undefined) state.prUrl = snapshot.prUrl;
	if (snapshot.prNumber !== undefined) state.prNumber = snapshot.prNumber;
}

export function markBabysitCompleted(state, lastAction = 'PR merge-ready') {
	state.status = 'completed';
	state.error = null;
	state.finishedAt = new Date().toISOString();
	state.lastAction = lastAction;
}

export function markBabysitFailed(state, error, lastAction = null) {
	state.status = 'failed';
	state.error = typeof error === 'string' ? error : error?.message || String(error);
	state.finishedAt = new Date().toISOString();
	if (lastAction) state.lastAction = lastAction;
}

export function loadBabysitState(runPath) {
	return loadState(runPath);
}

export function saveBabysitState(runPath, state) {
	saveState(runPath, state);
}

export function isMergeReady(state) {
	return (
		state.mergeable === true &&
		state.ciStatus === 'success' &&
		(state.unresolvedComments ?? 0) === 0
	);
}

export function isOrchestratorBabysitSuccess(state) {
	return state?.mode === BABYSIT_MODE && state?.status === 'completed';
}

export function isOrchestratorBabysitFailure(state) {
	return state?.mode === BABYSIT_MODE && state?.status === 'failed';
}
