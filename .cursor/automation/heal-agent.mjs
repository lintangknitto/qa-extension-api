import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAgent } from './lib/agent.mjs';
import { gitDiff, gitStatusPorcelain } from './lib/git.mjs';
import {
	HEAL_SUBAGENTS,
	getMaxRetriesForStage,
	incrementHeal
} from './lib/pipeline-state.mjs';
import { artifactExists, log, readPromptTemplate } from './lib/utils.mjs';

const CODE_BLOCKER_PATTERNS = [
	/src\//i,
	/test/i,
	/build/i,
	/lint/i,
	/typescript/i,
	/\.ts\b/i,
	/layer http/i,
	/controller/i,
	/queries/i,
	/repo/i
];

const DOCS_BLOCKER_PATTERNS = [/plan\.md/i, /api-design/i, /review\.json/i, /docs\//i, /prd/i];

function readLogTail(runPath, lines = 200) {
	const logPath = join(runPath, 'pipeline.log');
	if (!existsSync(logPath)) return '(tidak ada pipeline.log)';
	const content = readFileSync(logPath, 'utf8');
	return content.split('\n').slice(-lines).join('\n');
}

function readArtifactSnippet(runPath, file, maxChars = 4000) {
	const p = join(runPath, file);
	if (!existsSync(p)) return `(file tidak ada: ${file})`;
	const content = readFileSync(p, 'utf8');
	return content.length > maxChars ? `${content.slice(0, maxChars)}\n...(truncated)` : content;
}

function gatherStageContext(stage, ctx, runPath, errorMessage) {
	const blocks = [];

	blocks.push(`### Log pipeline (200 baris terakhir)\n\`\`\`\n${readLogTail(runPath)}\n\`\`\``);

	if (stage === 'plan') {
		blocks.push(`### plan.md\n\`\`\`\n${readArtifactSnippet(runPath, 'plan.md')}\n\`\`\``);
		blocks.push(`### api-design.md\n\`\`\`\n${readArtifactSnippet(runPath, 'api-design.md')}\n\`\`\``);
	}

	if (stage === 'dev' || stage === 'git') {
		try {
			const status = gitStatusPorcelain(ctx.repoRoot);
			const diff = gitDiff(ctx.repoRoot);
			blocks.push(`### git status --porcelain\n\`\`\`\n${status || '(clean)'}\n\`\`\``);
			blocks.push(
				`### git diff\n\`\`\`\n${diff.slice(0, 8000) || '(no diff)'}\n\`\`\``
			);
		} catch (e) {
			blocks.push(`### git context error: ${e.message}`);
		}
	}

	if (stage === 'pr') {
		try {
			blocks.push(`### git status\n\`\`\`\n${gitStatusPorcelain(ctx.repoRoot)}\n\`\`\``);
		} catch (e) {
			blocks.push(`### git status error: ${e.message}`);
		}
	}

	if (stage === 'review') {
		blocks.push(`### review.json\n\`\`\`\n${readArtifactSnippet(runPath, 'review.json')}\n\`\`\``);
		const prDiffPath = join(runPath, 'pr.diff');
		if (existsSync(prDiffPath)) {
			blocks.push(`### pr.diff path\n${prDiffPath.replace(/\\/g, '/')}`);
		}
	}

	if (errorMessage) {
		blocks.push(`### Pesan error\n${errorMessage}`);
	}

	return blocks.join('\n\n');
}

function isInfraError(errorMessage) {
	const msg = String(errorMessage || '').toLowerCase();
	return (
		msg.includes('agent spawn') ||
		msg.includes('agent failed') ||
		msg.includes('cursor_api_key') ||
		msg.includes('review.json not created') ||
		msg.includes('not found in path')
	);
}

function blockersTouchCode(blockers) {
	const text = (blockers || []).join('\n');
	return CODE_BLOCKER_PATTERNS.some((re) => re.test(text));
}

function blockersOnlyDocs(blockers) {
	const text = (blockers || []).join('\n');
	if (!text) return false;
	const hasDocs = DOCS_BLOCKER_PATTERNS.some((re) => re.test(text));
	const hasCode = blockersTouchCode(blockers);
	return hasDocs && !hasCode;
}

export function resolveReviewHealStrategy(runPath, errorMessage) {
	if (isInfraError(errorMessage)) {
		return { subagent: 'knitto-agent-reviewer', resumeFrom: 'review' };
	}

	if (artifactExists(runPath, 'review.json')) {
		try {
			const review = JSON.parse(readFileSync(join(runPath, 'review.json'), 'utf8'));
			if (review.verdict === 'fail') {
				const blockers = review.blockers || [];
				if (blockersTouchCode(blockers)) {
					return { subagent: 'knitto-agent-feature', resumeFrom: 'dev' };
				}
				if (blockersOnlyDocs(blockers)) {
					return { subagent: 'knitto-agent-reviewer', resumeFrom: 'review' };
				}
				return { subagent: 'knitto-agent-feature', resumeFrom: 'dev' };
			}
		} catch {
			return { subagent: 'knitto-agent-reviewer', resumeFrom: 'review' };
		}
	}

	return { subagent: 'knitto-agent-reviewer', resumeFrom: 'review' };
}

export function resolveHealSubagent(stage, runPath, errorMessage) {
	if (stage === 'review') {
		return resolveReviewHealStrategy(runPath, errorMessage);
	}
	return { subagent: HEAL_SUBAGENTS[stage] || 'knitto-agent-feature', resumeFrom: stage };
}

export function parseHealSummary(stdout) {
	if (!stdout) return null;
	const text = typeof stdout === 'string' ? stdout : JSON.stringify(stdout);
	const lines = text.split('\n');
	for (let i = lines.length - 1; i >= 0; i--) {
		const match = lines[i].match(/\[HEAL_SUMMARY\]\s*(.+)/);
		if (match) return match[1].trim();
	}
	return null;
}

export async function runHeal({ ctx, stage, error, state, runPath }) {
	const errorMessage = error?.message || String(error);
	const maxForStage = getMaxRetriesForStage(stage, {
		maxHealRetries: ctx.maxHealRetries,
		state
	});
	const attempt = (state.stageRetryCount?.[stage] || 0) + 1;

	const { subagent, resumeFrom } = resolveHealSubagent(stage, runPath, errorMessage);

	log(
		runPath,
		`[heal] attempt ${attempt}/${maxForStage} stage=${stage} subagent=${subagent} resumeFrom=${resumeFrom}`
	);

	if (ctx.dryRun) {
		log(runPath, `[heal] dry-run — skip agent call (mock heal untuk stage ${stage})`);
		incrementHeal(state, stage);
		state.healSummary = `[dry-run] mock heal stage ${stage}`;
		return { resumeFrom, healSummary: state.healSummary, subagent };
	}

	const contextBlock = gatherStageContext(stage, ctx, runPath, errorMessage);
	const promptVars = {
		SUBAGENT: subagent,
		STAGE: stage,
		PB: ctx.pb,
		TASK: ctx.taskSlug,
		EPIC_BRANCH: ctx.epicBranch,
		TASK_BRANCH: ctx.taskBranch,
		RUN_DIR: runPath.replace(/\\/g, '/'),
		PRD_PATH: ctx.prdPath?.replace(/\\/g, '/') || '',
		PR_URL: state.prUrl || '',
		ERROR_MESSAGE: errorMessage,
		CONTEXT_BLOCK: contextBlock
	};

	const prompt = readPromptTemplate(ctx.repoRoot, 'heal-agent.md', promptVars);
	const result = runAgent(prompt, {
		repoRoot: ctx.repoRoot,
		runPath,
		dryRun: false,
		timeoutSec: Number(process.env.STAGE_TIMEOUT_SEC || 3600)
	});

	const summary =
		parseHealSummary(result.stdout) ||
		parseHealSummary(result.result?.raw) ||
		parseHealSummary(JSON.stringify(result.result));

	incrementHeal(state, stage);
	state.healSummary = summary || `Heal selesai untuk stage ${stage}`;

	log(runPath, `[heal] selesai stage=${stage} summary=${state.healSummary}`);

	return { resumeFrom, healSummary: state.healSummary, subagent };
}
