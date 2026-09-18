import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAgent } from './lib/agent.mjs';
import { git, gitDiff, gitStatusPorcelain, verifyBuildTest } from './lib/git.mjs';
import { fetchCheckLogTail } from './lib/pr-github.mjs';
import { babysitLog, readPromptTemplate } from './lib/utils.mjs';

const SUBAGENT = 'knitto-agent-babysit';

function formatUnresolvedComments(comments) {
	if (!comments?.length) return '(tidak ada komentar unresolved)';
	return comments
		.map(
			(c, i) =>
				`${i + 1}. @${c.author} ${c.path || '(no path)'}:${c.line ?? '?'}\n   ${c.body}`
		)
		.join('\n\n');
}

function gatherGitContext(repoRoot) {
	try {
		const status = gitStatusPorcelain(repoRoot);
		const diff = gitDiff(repoRoot);
		return `### git status --porcelain\n\`\`\`\n${status || '(clean)'}\n\`\`\`\n\n### git diff\n\`\`\`\n${diff.slice(0, 8000) || '(no diff)'}\n\`\`\``;
	} catch (e) {
		return `(git context error: ${e.message})`;
	}
}

export function parseBabysitSummary(stdout) {
	if (!stdout) return null;
	const text = typeof stdout === 'string' ? stdout : JSON.stringify(stdout);
	const lines = text.split('\n');
	for (let i = lines.length - 1; i >= 0; i--) {
		const match = lines[i].match(/\[BABYSIT_SUMMARY\]\s*(.+)/);
		if (match) return match[1].trim();
	}
	return null;
}

function actionDescription(actionType) {
	switch (actionType) {
		case 'merge_conflict':
			return 'Resolve merge conflict dengan base epic branch. Preserve intent perubahan task branch dan base.';
		case 'merge_base':
			return 'Branch mungkin ketinggalan base. Merge origin epic branch ke task branch, resolve conflict jika ada.';
		case 'ci_failure':
			return 'Perbaiki penyebab CI failure dalam scope PR. Jangan ubah workflow CI.';
		case 'review_comments':
			return 'Address komentar review unresolved yang valid. Abaikan false positive dengan penjelasan.';
		default:
			return 'Buat PR merge-ready sesuai kondisi saat ini.';
	}
}

export async function runBabysitAgent(ctx) {
	const {
		repoRoot,
		runPath,
		prNumber,
		prUrl,
		pb,
		taskSlug,
		epicBranch,
		taskBranch,
		mergeable,
		ciStatus,
		unresolvedComments,
		actionType,
		dryRun
	} = ctx;

	babysitLog(runPath, `[babysit-agent] action=${actionType} subagent=${SUBAGENT}`);

	if (dryRun) {
		babysitLog(runPath, `[babysit-agent] dry-run — skip agent call`);
		return { summary: `[dry-run] mock babysit action ${actionType}`, subagent: SUBAGENT };
	}

	const ciLog = fetchCheckLogTail(prNumber, repoRoot, false);
	const promptVars = {
		SUBAGENT,
		PB: pb,
		TASK: taskSlug,
		EPIC_BRANCH: epicBranch,
		TASK_BRANCH: taskBranch,
		PR_URL: prUrl || '',
		PR_NUMBER: String(prNumber || ''),
		MERGEABLE: String(mergeable),
		CI_STATUS: ciStatus || 'unknown',
		RUN_DIR: runPath.replace(/\\/g, '/'),
		ACTION_DESCRIPTION: actionDescription(actionType),
		UNRESOLVED_COMMENTS: formatUnresolvedComments(unresolvedComments),
		CI_FAILURE_LOG: ciLog,
		GIT_CONTEXT: gatherGitContext(repoRoot)
	};

	const prompt = readPromptTemplate(repoRoot, 'babysit-agent.md', promptVars);
	const result = runAgent(prompt, {
		repoRoot,
		runPath,
		dryRun: false,
		timeoutSec: Number(process.env.STAGE_TIMEOUT_SEC || 3600)
	});

	const summary =
		parseBabysitSummary(result.stdout) ||
		parseBabysitSummary(result.result?.raw) ||
		parseBabysitSummary(JSON.stringify(result.result)) ||
		`Babysit selesai: ${actionType}`;

	babysitLog(runPath, `[babysit-agent] selesai summary=${summary}`);
	return { summary, subagent: SUBAGENT };
}

export function commitAndPushIfNeeded(ctx, summary) {
	const { repoRoot, taskBranch, dryRun } = ctx;
	if (dryRun) {
		babysitLog(ctx.runPath, '[babysit] dry-run — skip commit/push');
		return false;
	}

	const status = gitStatusPorcelain(repoRoot);
	if (!status.trim()) {
		babysitLog(ctx.runPath, '[babysit] working tree clean — skip commit');
		return false;
	}

	verifyBuildTest(repoRoot, false);

	git('add -A', repoRoot, false);
	const shortSummary = (summary || 'address review').slice(0, 72);
	const commitMsg = `fix(pr): address review — ${shortSummary}`.replace(/"/g, '\\"');
	git(`commit -m "${commitMsg}"`, repoRoot, false);
	git(`push origin ${taskBranch}`, repoRoot, false);
	babysitLog(ctx.runPath, `[babysit] pushed to ${taskBranch}`);
	return true;
}

export function appendBabysitSummary(runPath, iteration, summary, action) {
	if (!runPath) return;
	const line = `\n## Iterasi ${iteration}\n- Aksi: ${action}\n- Ringkasan: ${summary}\n- Waktu: ${new Date().toISOString()}\n`;
	try {
		appendFileSync(join(runPath, 'babysit-summary.md'), line);
	} catch {
		// ignore
	}
}

export function mergeBaseBranch(ctx) {
	const { repoRoot, epicBranch, dryRun, runPath } = ctx;
	babysitLog(runPath, `[babysit] merge origin/${epicBranch} into task branch`);
	git(`fetch origin ${epicBranch}`, repoRoot, dryRun);
	git(`merge origin/${epicBranch} --no-edit`, repoRoot, dryRun);
}
