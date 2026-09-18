import { mkdirSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export {
	STAGES,
	loadState,
	saveState,
	createInitialState,
	hydrateState,
	markRunning,
	markStageComplete,
	markFailed,
	markCompleted,
	incrementHeal,
	getMaxRetriesForStage,
	resetStagesFrom,
	isOrchestratorSuccess,
	isOrchestratorFailure,
	HEAL_SUBAGENTS
} from './pipeline-state.mjs';
import { STAGES } from './pipeline-state.mjs';

export function slugify(text) {
	return String(text)
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function epicBranchName(pb) {
	return `feat/${pb}`;
}

export function taskBranchName(pb, taskSlug) {
	return `feat/${pb}-${taskSlug}`;
}

export function fixBranchName(pb, taskSlug) {
	return `fix/${pb}-${taskSlug}`;
}

export function issuePathForRun(runPath) {
	return join(runPath, 'issue.md');
}

export function runDir(repoRoot, pb, taskSlug) {
	return join(repoRoot, '.cursor', 'runs', pb, taskSlug);
}

export function prdPath(repoRoot, pb, taskSlug) {
	return join(repoRoot, 'docs', 'pb', pb, taskSlug, 'prd.md');
}

export function ensureRunDir(runPath) {
	mkdirSync(runPath, { recursive: true });
}

export function readPromptTemplate(repoRoot, name, vars) {
	const path = join(repoRoot, '.cursor', 'automation', 'prompts', name);
	let content = readFileSync(path, 'utf8');
	for (const [key, value] of Object.entries(vars)) {
		content = content.replaceAll(`{{${key}}}`, value ?? '');
	}
	return content;
}

export function stageIndex(stage) {
	return STAGES.indexOf(stage);
}

export function shouldRunStage(stage, fromStage) {
	if (!fromStage) return true;
	return stageIndex(stage) >= stageIndex(fromStage);
}

export function artifactExists(runPath, file) {
	return existsSync(join(runPath, file));
}

export function log(runPath, message) {
	const line = `[${new Date().toISOString()}] ${message}\n`;
	process.stdout.write(line);
	if (runPath) {
		try {
			appendFileSync(join(runPath, 'pipeline.log'), line);
		} catch {
			// ignore
		}
	}
}

export function babysitLog(runPath, message) {
	const line = `[${new Date().toISOString()}] ${message}\n`;
	process.stdout.write(line);
	if (runPath) {
		try {
			appendFileSync(join(runPath, 'babysit.log'), line);
		} catch {
			// ignore
		}
	}
}

export function fixLog(runPath, message) {
	const line = `[${new Date().toISOString()}] ${message}\n`;
	process.stdout.write(line);
	if (runPath) {
		try {
			appendFileSync(join(runPath, 'fix.log'), line);
		} catch {
			// ignore
		}
	}
}
