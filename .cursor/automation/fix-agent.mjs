import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAgent } from './lib/agent.mjs';
import { gitDiff, gitStatusPorcelain } from './lib/git.mjs';
import { FIX_SUBAGENTS } from './lib/fix-state.mjs';
import { fixLog, readPromptTemplate } from './lib/utils.mjs';

const SUBAGENT = FIX_SUBAGENTS.fix;

function readIssueSnippet(issuePath, maxChars = 6000) {
	if (!existsSync(issuePath)) return '(issue.md tidak ditemukan)';
	const content = readFileSync(issuePath, 'utf8');
	return content.length > maxChars ? `${content.slice(0, maxChars)}\n...(truncated)` : content;
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

export function parseFixSummary(stdout) {
	if (!stdout) return null;
	const text = typeof stdout === 'string' ? stdout : JSON.stringify(stdout);
	const lines = text.split('\n');
	for (let i = lines.length - 1; i >= 0; i--) {
		const match = lines[i].match(/\[FIX_SUMMARY\]\s*(.+)/);
		if (match) return match[1].trim();
	}
	return null;
}

export async function runFixAgent(ctx) {
	const {
		repoRoot,
		runPath,
		pb,
		taskSlug,
		epicBranch,
		taskBranch,
		issuePath,
		githubIssueNumber,
		githubIssueUrl,
		errorMessage,
		dryRun
	} = ctx;

	fixLog(runPath, `[fix-agent] subagent=${SUBAGENT}`);

	if (dryRun) {
		fixLog(runPath, '[fix-agent] dry-run — skip agent call');
		return { summary: '[dry-run] mock fix agent', subagent: SUBAGENT };
	}

	const promptVars = {
		SUBAGENT,
		PB: pb,
		TASK: taskSlug,
		EPIC_BRANCH: epicBranch,
		TASK_BRANCH: taskBranch,
		RUN_DIR: runPath.replace(/\\/g, '/'),
		GITHUB_ISSUE_NUMBER: String(githubIssueNumber || ''),
		GITHUB_ISSUE_URL: githubIssueUrl || '',
		ISSUE_CONTENT: readIssueSnippet(issuePath),
		ERROR_MESSAGE: errorMessage || '(tidak ada error sebelumnya)',
		GIT_CONTEXT: gatherGitContext(repoRoot)
	};

	const prompt = readPromptTemplate(repoRoot, 'fix-agent.md', promptVars);
	const result = runAgent(prompt, {
		repoRoot,
		runPath,
		dryRun: false,
		timeoutSec: Number(process.env.STAGE_TIMEOUT_SEC || 3600)
	});

	const summary =
		parseFixSummary(result.stdout) ||
		parseFixSummary(result.result?.raw) ||
		parseFixSummary(JSON.stringify(result.result)) ||
		'Fix agent selesai';

	fixLog(runPath, `[fix-agent] selesai summary=${summary}`);
	return { summary, subagent: SUBAGENT };
}
