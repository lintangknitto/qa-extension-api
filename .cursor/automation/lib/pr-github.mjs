import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DRY_RUN_PR = {
	number: 123,
	url: 'https://github.com/example/repo/pull/123',
	state: 'OPEN',
	mergeable: 'MERGEABLE',
	headRefName: 'feat/PB-1.700.2-migrate-node',
	baseRefName: 'feat/PB-1.700.2',
	statusCheckRollup: [{ state: 'SUCCESS', conclusion: 'SUCCESS', name: 'ci' }]
};

const UNRESOLVED_THREADS_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          path
          line
          comments(first: 20) {
            nodes {
              body
              author { login }
              path
              line
            }
          }
        }
      }
    }
  }
}`;

function runGh(command, repoRoot, dryRun, fallback = null) {
	if (dryRun) return fallback;
	const r = spawnSync(`gh ${command}`, {
		cwd: repoRoot,
		shell: true,
		encoding: 'utf8',
		windowsHide: true
	});
	if (r.status !== 0) {
		throw new Error((r.stderr || r.stdout || `gh ${command}`).trim());
	}
	const out = (r.stdout || '').trim();
	if (!out) return null;
	try {
		return JSON.parse(out);
	} catch {
		return out;
	}
}

export function parsePrRef(prArg) {
	if (!prArg) throw new Error('PR reference is required');
	const trimmed = String(prArg).trim();
	const urlMatch = trimmed.match(/\/pull\/(\d+)/);
	if (urlMatch) return Number(urlMatch[1]);
	const num = Number(trimmed);
	if (Number.isNaN(num) || num <= 0) {
		throw new Error(`Invalid PR reference: ${prArg}`);
	}
	return num;
}

export function getRepoInfo(repoRoot, dryRun = false) {
	if (dryRun) return { owner: 'example', name: 'repo' };
	const data = runGh('repo view --json owner,name', repoRoot, false);
	return { owner: data.owner.login, name: data.name };
}

export function resolvePrByHead(headBranch, repoRoot, dryRun = false) {
	if (dryRun) return DRY_RUN_PR;
	const data = runGh(
		`pr list --head ${headBranch} --state open --json number,url,state,mergeable,headRefName,baseRefName,statusCheckRollup`,
		repoRoot,
		false
	);
	if (!data?.length) {
		throw new Error(`Tidak ada PR open untuk head branch: ${headBranch}`);
	}
	return data[0];
}

export function fetchPrView(prNumber, repoRoot, dryRun = false) {
	if (dryRun) return { ...DRY_RUN_PR };
	return runGh(
		`pr view ${prNumber} --json number,url,state,mergeable,headRefName,baseRefName,statusCheckRollup,commits`,
		repoRoot,
		false
	);
}

export function isPrOpen(prView) {
	return String(prView.state || '').toUpperCase() === 'OPEN';
}

export function isMergeConflict(prView) {
	return String(prView.mergeable || '').toUpperCase() === 'CONFLICTING';
}

export function isMergeable(prView) {
	return String(prView.mergeable || '').toUpperCase() === 'MERGEABLE';
}

export function deriveTaskFromBranches(headRefName, baseRefName) {
	const prefix = `${baseRefName}-`;
	if (!headRefName.startsWith(prefix)) {
		throw new Error(
			`Head branch tidak cocok dengan base: head=${headRefName}, expected prefix=${prefix}`
		);
	}
	const pb = baseRefName.replace(/^feat\//, '');
	const taskSlug = headRefName.slice(prefix.length);
	if (!pb || !taskSlug) {
		throw new Error(`Tidak bisa derive PB/task dari branch: ${headRefName} / ${baseRefName}`);
	}
	return { pb, taskSlug, epicBranch: baseRefName, taskBranch: headRefName };
}

export function validateBranchNaming(prView, pb, taskSlug, epicBranch, taskBranch) {
	if (prView.headRefName !== taskBranch) {
		throw new Error(
			`Head branch tidak cocok: expected ${taskBranch}, got ${prView.headRefName}`
		);
	}
	if (prView.baseRefName !== epicBranch) {
		throw new Error(
			`Base branch tidak cocok: expected ${epicBranch}, got ${prView.baseRefName}`
		);
	}
	const derived = deriveTaskFromBranches(prView.headRefName, prView.baseRefName);
	if (pb && derived.pb !== pb) {
		throw new Error(`PB dari branch (${derived.pb}) tidak cocok dengan --pb (${pb})`);
	}
	if (taskSlug && derived.taskSlug !== taskSlug) {
		throw new Error(`Task dari branch (${derived.taskSlug}) tidak cocok dengan --task (${taskSlug})`);
	}
	return derived;
}

function truncate(text, max = 500) {
	if (!text) return '';
	const s = String(text);
	return s.length > max ? `${s.slice(0, max)}...(truncated)` : s;
}

function runGraphql(query, variables, repoRoot) {
	const tmpDir = join(repoRoot, '.cursor', 'runs', '.tmp');
	mkdirSync(tmpDir, { recursive: true });
	const queryPath = join(tmpDir, 'babysit-graphql.json');
	const payload = { query, variables };
	writeFileSync(queryPath, JSON.stringify(payload), 'utf8');
	const quoted = queryPath.replace(/\\/g, '/');
	const r = spawnSync(`gh api graphql --input ${quoted}`, {
		cwd: repoRoot,
		shell: true,
		encoding: 'utf8',
		windowsHide: true
	});
	if (r.status !== 0) {
		throw new Error((r.stderr || r.stdout || 'gh api graphql').trim());
	}
	return JSON.parse(r.stdout);
}

export function fetchUnresolvedReviewThreads(prNumber, repoRoot, dryRun = false) {
	if (dryRun) {
		return [
			{
				threadId: 'dry-run-thread',
				path: 'src/example.ts',
				line: 10,
				author: 'bugbot',
				body: '(dry-run) unresolved review comment'
			}
		];
	}

	try {
		const { owner, name } = getRepoInfo(repoRoot, dryRun);
		const data = runGraphql(UNRESOLVED_THREADS_QUERY, { owner, name, number: prNumber }, repoRoot);
		const nodes = data?.data?.repository?.pullRequest?.reviewThreads?.nodes || [];
		const unresolved = [];

		for (const thread of nodes) {
			if (thread.isResolved) continue;
			const comments = thread.comments?.nodes || [];
			const first = comments[0] || {};
			unresolved.push({
				threadId: thread.id,
				path: thread.path || first.path || null,
				line: thread.line ?? first.line ?? null,
				author: first.author?.login || 'unknown',
				body: truncate(first.body, 800)
			});
		}

		return unresolved;
	} catch {
		return fetchUnresolvedReviewThreadsFallback(prNumber, repoRoot);
	}
}

function fetchUnresolvedReviewThreadsFallback(prNumber, repoRoot) {
	const r = spawnSync(`gh api repos/:owner/:repo/pulls/${prNumber}/comments`, {
		cwd: repoRoot,
		shell: true,
		encoding: 'utf8',
		windowsHide: true
	});
	if (r.status !== 0) {
		throw new Error(
			`Gagal fetch review comments: ${(r.stderr || r.stdout || '').trim()}`
		);
	}
	const comments = JSON.parse(r.stdout);
	return comments.slice(-20).map((c, i) => ({
		threadId: `fallback-${c.id || i}`,
		path: c.path || null,
		line: c.line ?? c.original_line ?? null,
		author: c.user?.login || 'unknown',
		body: truncate(c.body, 800)
	}));
}

export function fetchFailedChecks(prNumber, repoRoot, dryRun = false) {
	if (dryRun) return ['(dry-run) check failed: test'];
	const r = spawnSync(`gh pr checks ${prNumber}`, {
		cwd: repoRoot,
		shell: true,
		encoding: 'utf8',
		windowsHide: true
	});
	const output = (r.stdout || '') + (r.stderr || '');
	const failed = [];
	for (const line of output.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (/fail|x\s/i.test(trimmed) && !/pass|pending|skipping/i.test(trimmed)) {
			failed.push(trimmed.slice(0, 200));
		}
	}
	return failed.slice(0, 10);
}

export function rollupCiStatus(statusCheckRollup) {
	if (!statusCheckRollup || statusCheckRollup.length === 0) return 'pending';

	let hasPending = false;
	let hasFailure = false;

	for (const check of statusCheckRollup) {
		const state = String(check.state || check.status || '').toUpperCase();
		const conclusion = String(check.conclusion || check.state || '').toUpperCase();

		if (state === 'PENDING' || state === 'IN_PROGRESS' || state === 'QUEUED') {
			hasPending = true;
			continue;
		}
		if (
			conclusion === 'FAILURE' ||
			conclusion === 'FAILED' ||
			conclusion === 'ERROR' ||
			conclusion === 'CANCELLED' ||
			conclusion === 'TIMED_OUT' ||
			state === 'FAILURE' ||
			state === 'FAILED'
		) {
			hasFailure = true;
		}
	}

	if (hasFailure) return 'failure';
	if (hasPending) return 'pending';
	return 'success';
}

export function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollCi(prNumber, repoRoot, options = {}) {
	const { intervalMs = 30000, timeoutMs = 1800000, dryRun = false, onPoll = null } = options;
	const start = Date.now();

	while (Date.now() - start < timeoutMs) {
		const view = fetchPrView(prNumber, repoRoot, dryRun);
		const ciStatus = rollupCiStatus(view.statusCheckRollup);
		if (onPoll) onPoll(ciStatus, view);

		if (ciStatus !== 'pending') return ciStatus;

		if (dryRun) return 'success';

		await sleep(intervalMs);
	}

	throw new Error(`CI poll timeout setelah ${timeoutMs}ms`);
}

export function verifyGhAuth(repoRoot, dryRun = false) {
	if (dryRun) return;
	const r = spawnSync('gh auth status', {
		cwd: repoRoot,
		shell: true,
		encoding: 'utf8',
		windowsHide: true
	});
	if (r.status !== 0) {
		throw new Error(
			'GitHub CLI belum terautentikasi. Jalankan: gh auth login atau set GH_TOKEN/GITHUB_TOKEN'
		);
	}
}

export function fetchCheckLogTail(prNumber, repoRoot, dryRun = false, maxChars = 4000) {
	if (dryRun) return '(dry-run) CI log placeholder';
	try {
		const failed = fetchFailedChecks(prNumber, repoRoot, dryRun);
		return failed.join('\n').slice(0, maxChars) || '(tidak ada detail check gagal)';
	} catch (e) {
		return `(error fetching checks: ${e.message})`;
	}
}

const DRY_RUN_ISSUE = {
	number: 456,
	title: 'Login timeout 500',
	body: 'User mendapat HTTP 500 saat token expired pada endpoint login.',
	state: 'OPEN',
	url: 'https://github.com/example/repo/issues/456',
	labels: [{ name: 'bug' }, { name: 'PB-1.700.2' }]
};

export function parseIssueRef(issueArg) {
	if (!issueArg) throw new Error('GitHub issue reference is required');
	const trimmed = String(issueArg).trim();
	const urlMatch = trimmed.match(/\/issues\/(\d+)/);
	if (urlMatch) return Number(urlMatch[1]);
	const num = Number(trimmed);
	if (Number.isNaN(num) || num <= 0) {
		throw new Error(`Invalid GitHub issue reference: ${issueArg}`);
	}
	return num;
}

export function fetchGitHubIssue(issueNumber, repoRoot, dryRun = false) {
	if (dryRun) return { ...DRY_RUN_ISSUE, number: issueNumber || DRY_RUN_ISSUE.number };
	return runGh(
		`issue view ${issueNumber} --json number,title,body,state,url,labels`,
		repoRoot,
		false
	);
}

export function isIssueOpen(issue) {
	return String(issue?.state || '').toUpperCase() === 'OPEN';
}

export function formatIssueLabels(labels) {
	if (!labels?.length) return '(none)';
	return labels.map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean).join(', ');
}

export function formatIssueMarkdown(issue) {
	const labels = formatIssueLabels(issue.labels);
	return `# GitHub Issue #${issue.number} — ${issue.title}

Source: ${issue.url}
Labels: ${labels}

---

${issue.body || '(no body)'}`;
}

export function writeIssueMarkdown(issue, filePath, dryRun = false) {
	const content = formatIssueMarkdown(issue);
	if (!dryRun) {
		writeFileSync(filePath, content, 'utf8');
	}
	return content;
}
