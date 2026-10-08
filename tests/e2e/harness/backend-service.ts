import { spawn, ChildProcess } from 'child_process';
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
	options: { port?: number; customAppSecret?: string } = {}
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
		OPENAI_BASE_URL: endpoints.mockAi.baseUrl,
		OPENAI_API_KEY: 'e2e-fake-mock-key',
		OPENAI_MODEL: 'mock-gpt-4o',
		PROJECT_ADMIN_LEVELS: 'ADMIN,QA,SUPERADMIN'
	};

	const child: ChildProcess = spawn(
		'pnpm',
		['exec', 'tsx', 'src/index.ts'],
		{
			cwd: projectRoot,
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
			shell: true
		}
	);

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
		child.kill();
		throw new Error(`Backend gagal start dalam 30s. Output server:\n${serverOutput}`);
	}

	const baseUrl = `http://127.0.0.1:${port}`;

	return {
		port,
		baseUrl,
		stop: async () => {
			if (child.pid) {
				child.kill();
			}
		}
	};
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
