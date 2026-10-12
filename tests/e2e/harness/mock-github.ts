import crypto from 'crypto';
import http from 'http';
import { AddressInfo } from 'net';

export interface IMockRepoFile {
	path: string;
	content: string;
}

interface IMockRepo {
	defaultBranch: string;
	/** branch → SHA commit head */
	branches: Record<string, string>;
	/** SHA commit → file */
	commits: Record<string, IMockRepoFile[]>;
	/** true = hanya bisa diakses dengan token yang benar (repo private). */
	private: boolean;
}

export interface IMockGitHub {
	/** Base URL GitHub API palsu (GITHUB_API_BASE_URL). */
	baseUrl: string;
	/** Base URL OpenAI-compatible palsu (embeddings + chat) — EMBEDDING_BASE_URL / OPENAI_BASE_URL. */
	aiBaseUrl: string;
	token: string;
	/** Token yang diterima repo private (untuk mensimulasikan token dicabut/salah). */
	setAcceptedToken: (value: string) => void;
	/** `true` = semua permintaan embedding dibalas 429 (mensimulasikan provider gagal di tengah index). */
	setEmbeddingsFailing: (value: boolean) => void;
	setRepo: (key: string, repo: IMockRepo) => void;
	/** Commit baru di branch: file diganti/ditambah sesuai `files`. */
	pushCommit: (key: string, branch: string, sha: string, files: IMockRepoFile[]) => void;
	counters: { contents: number; trees: number; heads: number; embeddingInputs: number };
	/** Isi pesan user setiap permintaan chat (konteks investigasi). */
	chatPrompts: string[];
	stop: () => Promise<void>;
}

/** SHA blob palsu: berubah bila isi file berubah (seperti blob git). */
const blobSha = (file: IMockRepoFile): string => crypto.createHash('sha1').update(`${file.path}:${file.content}`).digest('hex');

/**
 * GitHub API + provider AI palsu untuk E2E auto-index codebase: repo/commit/tree/contents, dan
 * `/v1/embeddings` (vektor deterministik 1536 dimensi) + `/v1/chat/completions` (menangkap prompt).
 */
export const startMockGitHub = async (token = 'e2e-gh-token'): Promise<IMockGitHub> => {
	const repos = new Map<string, IMockRepo>();
	const counters = { contents: 0, trees: 0, heads: 0, embeddingInputs: 0 };
	const chatPrompts: string[] = [];
	let acceptedToken = token;
	let embeddingsFailing = false;

	const server = http.createServer((req, res) => {
		const url = new URL(req.url || '/', 'http://localhost');
		const json = (status: number, body: unknown) => {
			res.writeHead(status, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(body));
		};
		let body = '';
		req.on('data', (chunk) => (body += chunk));
		req.on('end', () => {
			if (url.pathname === '/v1/embeddings') {
				if (embeddingsFailing) return json(429, { error: { message: 'Rate limit (mock)' } });
				const input = JSON.parse(body).input as string | string[];
				const inputs = Array.isArray(input) ? input : [input];
				counters.embeddingInputs += inputs.length;
				json(200, { data: inputs.map((text, index) => ({ index, embedding: Array.from({ length: 1536 }, (_, i) => ((text.length + i) % 7) / 7 + 0.01) })) });
				return;
			}
			if (url.pathname === '/v1/chat/completions') {
				const messages = (JSON.parse(body).messages || []) as Array<{ role: string; content: string }>;
				chatPrompts.push(messages.find((m) => m.role === 'user')?.content || '');
				json(200, { id: 'mock', object: 'chat.completion', model: 'mock', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '## Ringkasan\nMock investigasi auto-index.' } }] });
				return;
			}

			const match = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(url.pathname);
			const repo = match ? repos.get(`${match[1]}/${match[2]}`.toLowerCase()) : undefined;
			if (!match || !repo) return json(404, { message: 'Not Found' });
			if (repo.private && req.headers.authorization !== `Bearer ${acceptedToken}`) {
				return json(req.headers.authorization ? 401 : 404, { message: req.headers.authorization ? 'Bad credentials' : 'Not Found' });
			}
			const rest = match[3] || '';
			if (rest === '') return json(200, { default_branch: repo.defaultBranch });
			const commit = /^\/commits\/(.+)$/.exec(rest);
			if (commit) {
				counters.heads++;
				const sha = repo.branches[decodeURIComponent(commit[1])];
				return sha ? json(200, { sha }) : json(404, { message: 'No commit found' });
			}
			const tree = /^\/git\/trees\/([^/]+)$/.exec(rest);
			if (tree) {
				counters.trees++;
				const files = repo.commits[tree[1]];
				if (!files) return json(404, { message: 'Not Found' });
				return json(200, { tree: files.map((f) => ({ path: f.path, type: 'blob', sha: blobSha(f), size: f.content.length })) });
			}
			const contents = /^\/contents\/(.+)$/.exec(rest);
			if (contents) {
				counters.contents++;
				const file = repo.commits[url.searchParams.get('ref') || '']?.find((f) => f.path === decodeURIComponent(contents[1]));
				if (!file) return json(404, { message: 'Not Found' });
				return json(200, { content: Buffer.from(file.content).toString('base64'), encoding: 'base64' });
			}
			return json(404, { message: 'Not Found' });
		});
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
	const { port } = server.address() as AddressInfo;
	const base = `http://127.0.0.1:${port}`;

	return {
		baseUrl: base,
		aiBaseUrl: `${base}/v1`,
		token,
		setAcceptedToken: (value) => (acceptedToken = value),
		setEmbeddingsFailing: (value) => (embeddingsFailing = value),
		counters,
		chatPrompts,
		setRepo: (key, repo) => repos.set(key.toLowerCase(), repo),
		pushCommit: (key, branch, sha, files) => {
			const repo = repos.get(key.toLowerCase());
			if (!repo) throw new Error(`Repo mock ${key} belum ada`);
			const previous = repo.commits[repo.branches[branch]] ?? [];
			const next = previous.filter((f) => !files.some((n) => n.path === f.path)).concat(files);
			repo.commits[sha] = next;
			repo.branches[branch] = sha;
		},
		stop: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
	};
};
