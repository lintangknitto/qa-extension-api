import { spawn, spawnSync, ChildProcess } from 'child_process';
import http from 'http';
import path from 'path';
import { IDisposableStackEndpoints } from './disposable-stack';

export interface IBackendService {
	port: number;
	baseUrl: string;
	stop: () => Promise<void>;
}

export const startBackendService = async (
	endpoints: IDisposableStackEndpoints,
	options: { port?: number; customAppSecret?: string; extraEnv?: NodeJS.ProcessEnv } = {}
): Promise<IBackendService> => {
	// Pilih port dinamis jika tidak ditentukan
	const port = options.port || (await getRandomPort());
	const appSecret = options.customAppSecret || 'e2e-super-secret-key-at-least-32-chars-long!!';
	const projectRoot = path.resolve(__dirname, '../../../');

	const env: NodeJS.ProcessEnv = {
		...process.env,
		NODE_ENV: 'test',
		APP_PORT_HTTP: String(port),
		APP_SECRET_KEY: appSecret,
		RECORDING_FEATURE_ENABLED: 'true',
		POSTGRES_HOST: endpoints.postgres.host,
		POSTGRES_PORT: String(endpoints.postgres.port),
		POSTGRES_USER: endpoints.postgres.user,
		POSTGRES_PASSWORD: endpoints.postgres.pass,
		POSTGRES_DB: endpoints.postgres.db,
		MINIO_ENDPOINT: endpoints.minio.host,
		MINIO_PORT: String(endpoints.minio.port),
		MINIO_ACCESS_KEY: endpoints.minio.accessKey,
		MINIO_SECRET_KEY: endpoints.minio.secretKey,
		MINIO_BUCKET: endpoints.minio.bucket,
		MINIO_USE_SSL: 'false',
		MINIO_PUBLIC_BASE_URL: `http://${endpoints.minio.host}:${endpoints.minio.port}`,
		OPENAI_BASE_URL: endpoints.mockAi.baseUrl,
		OPENAI_API_KEY: 'e2e-fake-mock-key',
		OPENAI_MODEL: 'mock-gpt-4o',
		PROJECT_ADMIN_LEVELS: 'ADMIN,QA,SUPERADMIN',
		...options.extraEnv
	};

	// Run node itself with the tsx loader: one process, no pnpm/shell wrapper whose kill() would leave the
	// real server orphaned (holding its port and DB/MinIO connections) — notably on Windows.
	const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
		cwd: projectRoot,
		env,
		stdio: ['ignore', 'pipe', 'pipe'],
		// Own process group on POSIX so the whole tree can be signalled.
		detached: process.platform !== 'win32'
	});

	let serverOutput = '';
	child.stdout?.on('data', (d) => {
		serverOutput += d.toString();
	});
	child.stderr?.on('data', (d) => {
		serverOutput += d.toString();
	});

	// Tunggu sampai backend siap merespons HTTP request
	const maxWaitMs = 30000;
	const startTime = Date.now();
	let ready = false;

	while (Date.now() - startTime < maxWaitMs) {
		try {
			const isUp = await checkHttpReady(port);
			if (isUp) {
				ready = true;
				break;
			}
		} catch (_) {
			// retry
		}
		await new Promise((r) => setTimeout(r, 400));
	}

	if (!ready) {
		await stopProcessTree(child);
		throw new Error(`Backend gagal start dalam 30s. Output server:\n${serverOutput}`);
	}

	const baseUrl = `http://127.0.0.1:${port}`;

	return {
		port,
		baseUrl,
		stop: () => stopProcessTree(child)
	};
};

/** Kill the child and everything it spawned, then wait for it to exit (force-kill after a grace period). */
export const stopProcessTree = async (child: ChildProcess, graceMs = 5000): Promise<void> => {
	if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
	const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));

	const killTree = (force: boolean) => {
		try {
			if (process.platform === 'win32') {
				spawnSync('taskkill', ['/pid', String(child.pid), '/T', ...(force ? ['/F'] : [])], { stdio: 'ignore' });
			} else {
				process.kill(-child.pid!, force ? 'SIGKILL' : 'SIGTERM');
			}
		} catch {
			// Already gone.
		}
	};

	// Windows can't deliver a graceful signal to a console-less node process, so force from the start.
	killTree(process.platform === 'win32');
	const timer = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), graceMs).unref());
	if ((await Promise.race([exited, timer])) === 'timeout') {
		killTree(true);
		await exited;
	}
};

const getRandomPort = (): Promise<number> => {
	return new Promise((resolve, reject) => {
		const s = http.createServer();
		s.listen(0, '127.0.0.1', () => {
			const address = s.address();
			if (!address || typeof address === 'string') {
				s.close(() => reject(new Error('Gagal alokasi random port')));
				return;
			}
			const p = address.port;
			s.close(() => resolve(p));
		});
	});
};

const checkHttpReady = (port: number): Promise<boolean> => {
	return new Promise((resolve) => {
		const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
			if (res.statusCode === 200) {
				resolve(true);
			} else {
				resolve(false);
			}
		});
		req.on('error', () => resolve(false));
		req.setTimeout(1000, () => {
			req.destroy();
			resolve(false);
		});
	});
};
