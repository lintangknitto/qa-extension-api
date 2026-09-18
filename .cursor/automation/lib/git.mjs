import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertShellAllowed } from './guard.mjs';

function shellQuotePath(filePath) {
	return `"${filePath.replace(/\\/g, '/').replace(/"/g, '\\"')}"`;
}

function writeGhBodyFile(dir, filename, content) {
	mkdirSync(dir, { recursive: true });
	const filePath = join(dir, filename);
	writeFileSync(filePath, content, 'utf8');
	return filePath;
}

export function runShell(command, options = {}) {
	assertShellAllowed(command);
	const { cwd, dryRun = false, env = process.env } = options;

	if (dryRun) {
		console.log(`[dry-run] shell: ${command}`);
		return { status: 0, stdout: '', stderr: '' };
	}

	const result = spawnSync(command, {
		cwd,
		env,
		shell: true,
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
		windowsHide: true
	});

	if (result.status !== 0) {
		const stdout = (result.stdout || '').trim();
		const stderr = (result.stderr || '').trim();
		const detail = [stdout, stderr].filter(Boolean).join('\n').trim();
		const message = detail || `Command failed: ${command}`;
		throw new Error(`Command failed (exit ${result.status}): ${command}\n${message}`);
	}

	return result;
}

export function git(args, cwd, dryRun = false) {
	return runShell(`git ${args}`, { cwd, dryRun });
}

export function gh(args, cwd, dryRun = false) {
	return runShell(`gh ${args}`, { cwd, dryRun });
}

export function branchExistsRemote(branch, cwd, dryRun) {
	if (dryRun) return false;
	const r = spawnSync(`git ls-remote --heads origin ${branch}`, {
		cwd,
		shell: true,
		encoding: 'utf8',
		windowsHide: true
	});
	return Boolean(r.stdout?.trim());
}

export function setupGitBranches(ctx) {
	const { repoRoot, epicBranch, taskBranch, baseBranch, dryRun } = ctx;

	git('fetch origin', repoRoot, dryRun);

	const epicRemote = branchExistsRemote(epicBranch, repoRoot, dryRun);

	if (!epicRemote) {
		git(`checkout -B ${epicBranch} origin/${baseBranch}`, repoRoot, dryRun);
		if (!dryRun) {
			git(`push -u origin ${epicBranch}`, repoRoot, dryRun);
		}
	} else {
		git(`checkout ${epicBranch}`, repoRoot, dryRun);
		git(`pull origin ${epicBranch}`, repoRoot, dryRun);
	}

	git(`checkout -B ${taskBranch} ${epicBranch}`, repoRoot, dryRun);
	if (!dryRun) {
		git(`push -u origin ${taskBranch}`, repoRoot, dryRun);
	}
}

function gitStdout(args, cwd) {
	const result = spawnSync(`git ${args}`, {
		cwd,
		shell: true,
		encoding: 'utf8',
		windowsHide: true
	});
	if (result.status !== 0) {
		throw new Error((result.stderr || result.stdout || `git ${args}`).trim());
	}
	return (result.stdout || '').trim();
}

function findExistingPrUrl(taskBranch, repoRoot, dryRun) {
	if (dryRun) return null;
	const r = spawnSync(`gh pr list --head ${taskBranch} --json url --jq ".[0].url"`, {
		cwd: repoRoot,
		shell: true,
		encoding: 'utf8',
		windowsHide: true
	});
	if (r.status !== 0) return null;
	const url = (r.stdout || '').trim();
	return url && url !== 'null' ? url : null;
}

export function commitAndCreatePr(ctx) {
	const {
		repoRoot,
		pb,
		taskSlug,
		epicBranch,
		taskBranch,
		runPath,
		dryRun,
		prKind = 'feat',
		githubIssueNumber = null
	} = ctx;

	const prefix = prKind === 'fix' ? 'fix' : 'feat';

	git('add -A', repoRoot, dryRun);

	const hasUncommitted = dryRun
		? true
		: Boolean(
				spawnSync('git status --porcelain', {
					cwd: repoRoot,
					shell: true,
					encoding: 'utf8',
					windowsHide: true
				}).stdout?.trim()
			);

	if (!dryRun) {
		if (hasUncommitted) {
			const summary = taskSlug.replace(/-/g, ' ');
			const commitMsg = `${prefix}(${pb}): ${taskSlug} — ${summary}`;
			assertShellAllowed(`git commit -m "${commitMsg}"`);
			git(`commit -m "${commitMsg.replace(/"/g, '\\"')}"`, repoRoot, dryRun);
		} else {
			console.log('[pr] Working tree clean — skip commit, cek commit yang sudah ada.');
		}

		const ahead = gitStdout(`rev-list --count ${epicBranch}..HEAD`, repoRoot);
		if (ahead === '0') {
			const stageLabel = prKind === 'fix' ? 'fix' : 'dev';
			throw new Error(
				`Stage ${stageLabel} tidak menghasilkan perubahan kode: tidak ada commit di ${taskBranch} ` +
					`yang belum ada di ${epicBranch}. Kemungkinan agent tidak mengubah file (bug report kurang jelas ` +
					`atau perubahan hanya di file yang di-ignore). Perjelas Reproduction/Expected/Actual di issue, ` +
					`lalu jalankan ulang fix.`
			);
		}

		git(`push origin ${taskBranch}`, repoRoot, dryRun);
	}

	const title = `${prefix}(${pb}): ${taskSlug}`;
	let body = `Automated PR for ${pb} / ${taskSlug}`;
	if (githubIssueNumber) {
		body += `\n\nFixes #${githubIssueNumber}`;
	}
	const planPath = join(runPath, 'plan.md');
	const apiPath = join(runPath, 'api-design.md');
	if (prKind !== 'fix' && existsSync(planPath)) {
		body += `\n\n## Plan\n${readFileSync(planPath, 'utf8').slice(0, 4000)}`;
	}
	if (prKind !== 'fix' && existsSync(apiPath)) {
		body += `\n\n## API design\n${readFileSync(apiPath, 'utf8').slice(0, 4000)}`;
	}
	const issuePath = join(runPath, 'issue.md');
	if (existsSync(issuePath)) {
		body += `\n\n## Issue\n${readFileSync(issuePath, 'utf8').slice(0, 4000)}`;
	}

	const escapedTitle = title.replace(/"/g, '\\"');

	if (dryRun) {
		return 'https://github.com/example/repo/pull/dry-run';
	}

	const existingPr = findExistingPrUrl(taskBranch, repoRoot, dryRun);
	if (existingPr) {
		console.log(`[pr] PR sudah ada: ${existingPr}`);
		return existingPr;
	}

	const bodyFile = writeGhBodyFile(runPath, 'pr-body.md', body);
	const prCreate = gh(
		`pr create --base ${epicBranch} --head ${taskBranch} --title "${escapedTitle}" --body-file ${shellQuotePath(bodyFile)}`,
		repoRoot,
		dryRun
	);

	return prCreate.stdout.trim().split('\n').pop();
}

export function getPrDiff(prUrl, repoRoot, dryRun) {
	if (dryRun) return '(dry-run diff placeholder)';
	const r = gh(`pr diff ${prUrl}`, repoRoot, dryRun);
	return r.stdout.slice(0, 50000);
}

export function assignPr(prUrl, assignee, repoRoot, dryRun) {
	const user = assignee.replace(/^@/, '');
	gh(`pr edit ${prUrl} --add-assignee ${user}`, repoRoot, dryRun);
}

export function commentPr(prUrl, body, repoRoot, dryRun) {
	const commentFile = writeGhBodyFile(
		join(repoRoot, '.cursor', 'runs'),
		'pr-comment.md',
		body
	);
	gh(`pr comment ${prUrl} --body-file ${shellQuotePath(commentFile)}`, repoRoot, dryRun);
}

export function gitStatusPorcelain(repoRoot) {
	return gitStdout('status --porcelain', repoRoot);
}

export function gitDiff(repoRoot) {
	return gitStdout('diff', repoRoot);
}

/** Jumlah commit di HEAD yang belum ada di baseBranch. */
export function commitsAhead(baseBranch, repoRoot) {
	try {
		return Number(gitStdout(`rev-list --count ${baseBranch}..HEAD`, repoRoot)) || 0;
	} catch {
		return 0;
	}
}

/** True bila working tree bersih DAN tidak ada commit baru di atas baseBranch. */
export function hasNoChanges(baseBranch, repoRoot) {
	const dirty = gitStatusPorcelain(repoRoot).length > 0;
	return !dirty && commitsAhead(baseBranch, repoRoot) === 0;
}

export function verifyBuildTest(repoRoot, dryRun) {
	if (dryRun) {
		console.log('[dry-run] pnpm build && pnpm test');
		return;
	}
	runShell('pnpm build', { cwd: repoRoot, dryRun });
	runShell('pnpm test', { cwd: repoRoot, dryRun });
}
