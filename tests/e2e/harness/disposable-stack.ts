import { spawnSync } from 'child_process';
import path from 'path';
import crypto from 'crypto';
import { Pool } from 'pg';
import * as Minio from 'minio';

/** Only harness-generated compose projects; never a persistent one such as `dev-infra`. */
const PROJECT_NAME_PATTERN = /^knitto-e2e-[a-z0-9-]+$/;

export interface IDisposableStackConfig {
	projectName?: string;
	postgresUser?: string;
	postgresPassword?: string;
	postgresDb?: string;
	minioAccessKey?: string;
	minioSecretKey?: string;
	minioBucket?: string;
}

export interface IDisposableStackEndpoints {
	projectName: string;
	postgres: {
		host: string;
		port: number;
		user: string;
		pass: string;
		db: string;
		connectionString: string;
	};
	minio: {
		host: string;
		port: number;
		accessKey: string;
		secretKey: string;
		bucket: string;
	};
	mockAi: {
		host: string;
		port: number;
		baseUrl: string;
	};
}

/** Policy anonim read+write setara `mc anonymous set public`. */
export const publicBucketPolicy = (bucket: string) => ({
	Version: '2012-10-17',
	Statement: [
		{
			Effect: 'Allow',
			Principal: { AWS: ['*'] },
			Action: ['s3:GetBucketLocation', 's3:ListBucket', 's3:ListBucketMultipartUploads'],
			Resource: [`arn:aws:s3:::${bucket}`]
		},
		{
			Effect: 'Allow',
			Principal: { AWS: ['*'] },
			Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:AbortMultipartUpload', 's3:ListMultipartUploadParts'],
			Resource: [`arn:aws:s3:::${bucket}/*`]
		}
	]
});

export class DisposableStack {
	private readonly composeFile: string;
	private readonly projectName: string;
	private readonly env: NodeJS.ProcessEnv;
	private endpoints: IDisposableStackEndpoints | null = null;
	private isStarted = false;
	private cleanupRegistered = false;

	constructor(config: IDisposableStackConfig = {}) {
		const randomSuffix = crypto.randomBytes(4).toString('hex');
		this.projectName = config.projectName || `knitto-e2e-${Date.now()}-${randomSuffix}`;
		this.composeFile = path.resolve(__dirname, '../../../dev-infra/docker-compose.e2e.yml');

		// SAFETY GUARD: `down -v` runs against this project, so it must never name a persistent compose project.
		if (!PROJECT_NAME_PATTERN.test(this.projectName)) {
			throw new Error(
				`SAFETY GUARD VIOLATION: projectName "${this.projectName}" harus cocok ${PROJECT_NAME_PATTERN} agar down -v tidak menyentuh project persisten.`
			);
		}

		const postgresUser = config.postgresUser || `e2e_user_${randomSuffix}`;
		const postgresPassword = config.postgresPassword || `e2e_pass_${randomSuffix}`;
		const postgresDb = config.postgresDb || `e2e_db_${randomSuffix}`;
		const minioAccessKey = config.minioAccessKey || `e2e_minio_${randomSuffix}`;
		const minioSecretKey = config.minioSecretKey || `e2e_sec_${randomSuffix}${randomSuffix}`;
		const minioBucket = config.minioBucket || 'qa-recording-artifacts';

		// SAFETY GUARD: Dilarang menggunakan database atau kredensial produksi / lokal persisten
		this.assertSafety({ postgresDb });

		// Drop any E2E_* value inherited from the shell: an exported E2E_POSTGRES_PORT=5432 (or a persistent
		// DB name) would otherwise flow straight into the compose file. Ports are always dynamic.
		const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('E2E_')));
		this.env = {
			...inherited,
			E2E_POSTGRES_USER: postgresUser,
			E2E_POSTGRES_PASSWORD: postgresPassword,
			E2E_POSTGRES_DB: postgresDb,
			E2E_MINIO_ACCESS_KEY: minioAccessKey,
			E2E_MINIO_SECRET_KEY: minioSecretKey,
			E2E_MINIO_BUCKET: minioBucket,
			E2E_POSTGRES_PORT: '0',
			E2E_MINIO_PORT: '0',
			E2E_MINIO_CONSOLE_PORT: '0',
			E2E_MOCK_AI_PORT: '0'
		};
	}

	public assertSafety(params: { postgresDb?: string; postgresPort?: number; postgresHost?: string }): void {
		if (params.postgresDb !== undefined) {
			const db = params.postgresDb.toLowerCase();
			if (db === 'knitto_qa') {
				throw new Error('SAFETY GUARD VIOLATION: Dilarang menghubungkan E2E harness ke database persisten knitto_qa.');
			}
			if (!db.startsWith('e2e_')) {
				throw new Error(`SAFETY GUARD VIOLATION: Nama database E2E harus berawalan "e2e_" (diterima: "${params.postgresDb}").`);
			}
		}
		if (params.postgresPort === 5432 && (!params.postgresHost || params.postgresHost === 'localhost' || params.postgresHost === '127.0.0.1')) {
			throw new Error('SAFETY GUARD VIOLATION: Dilarang memakai port default PostgreSQL persisten 5432.');
		}
	}

	/** Run `docker compose` for this project with argv (no shell string interpolation). */
	private compose(args: string[], stdio: 'pipe' | 'ignore' = 'pipe'): string {
		const res = spawnSync('docker', ['compose', '-p', this.projectName, '-f', this.composeFile, ...args], {
			env: this.env,
			encoding: 'utf-8',
			stdio: stdio === 'ignore' ? 'ignore' : ['ignore', 'pipe', 'pipe']
		});
		if (res.error) throw res.error;
		if (res.status !== 0) {
			throw new Error(`docker compose ${args.join(' ')} gagal (exit ${res.status}): ${(res.stderr ?? '').trim()}`);
		}
		return (res.stdout ?? '').trim();
	}

	public getProjectName(): string {
		return this.projectName;
	}

	public getEndpoints(): IDisposableStackEndpoints {
		if (!this.endpoints) {
			throw new Error('Disposable stack belum dimulai.');
		}
		return this.endpoints;
	}

	private registerProcessHooks(): void {
		if (this.cleanupRegistered) return;
		this.cleanupRegistered = true;

		const exitHandler = () => {
			if (this.isStarted) {
				try {
					this.stopSync();
				} catch (_) {
					// silent on exit
				}
			}
		};

		process.once('exit', exitHandler);
		process.once('SIGINT', () => {
			exitHandler();
			process.exit(130);
		});
		process.once('SIGTERM', () => {
			exitHandler();
			process.exit(143);
		});
	}

	private getPublishedPort(service: string, containerPort: number): number {
		const stdout = this.compose(['port', service, String(containerPort)]);

		// Format output: 0.0.0.0:12345 atau [::]:12345 atau 127.0.0.1:12345
		const match = stdout.match(/:(\d+)$/);
		if (!match || !match[1]) {
			throw new Error(`Gagal mengambil port yang dipublikasikan untuk service ${service}:${containerPort}. Output: ${stdout}`);
		}
		return parseInt(match[1], 10);
	}

	public async start(): Promise<IDisposableStackEndpoints> {
		this.registerProcessHooks();

		// Mark started before `up`: a failed/timed-out `up --wait` can still leave half-created containers
		// and networks behind, and stop()/the exit hook only clean up a started stack.
		this.isStarted = true;
		try {
			this.compose(['up', '-d', '--wait']);
		} catch (err) {
			this.stopSync();
			throw err;
		}

		const pgPort = this.getPublishedPort('postgres', 5432);
		const minioPort = this.getPublishedPort('minio', 9000);
		const mockAiPort = this.getPublishedPort('mock-ai', 8080);

		// Validasi ulang port yang didapat bukan port persisten 5432 jika host localhost
		this.assertSafety({ postgresPort: pgPort, postgresDb: this.env.E2E_POSTGRES_DB });

		const pgUser = this.env.E2E_POSTGRES_USER!;
		const pgPass = this.env.E2E_POSTGRES_PASSWORD!;
		const pgDb = this.env.E2E_POSTGRES_DB!;
		const minioUser = this.env.E2E_MINIO_ACCESS_KEY!;
		const minioPass = this.env.E2E_MINIO_SECRET_KEY!;
		const bucket = this.env.E2E_MINIO_BUCKET || 'qa-recording-artifacts';

		this.endpoints = {
			projectName: this.projectName,
			postgres: {
				host: '127.0.0.1',
				port: pgPort,
				user: pgUser,
				pass: pgPass,
				db: pgDb,
				connectionString: `postgresql://${pgUser}:${pgPass}@127.0.0.1:${pgPort}/${pgDb}`
			},
			minio: {
				host: '127.0.0.1',
				port: minioPort,
				accessKey: minioUser,
				secretKey: minioPass,
				bucket
			},
			mockAi: {
				host: '127.0.0.1',
				port: mockAiPort,
				baseUrl: `http://127.0.0.1:${mockAiPort}/v1`
			}
		};

		// Verifikasi koneksi PostgreSQL
		await this.verifyPostgres(this.endpoints.postgres);

		// Buat MinIO bucket awal jika belum ada
		await this.ensureMinioBucket(this.endpoints.minio);

		return this.endpoints;
	}

	private async verifyPostgres(pgConfig: IDisposableStackEndpoints['postgres']): Promise<void> {
		const pool = new Pool({
			host: pgConfig.host,
			port: pgConfig.port,
			user: pgConfig.user,
			password: pgConfig.pass,
			database: pgConfig.db,
			connectionTimeoutMillis: 5000
		});

		try {
			const res = await pool.query('SELECT 1 AS ready');
			if (res.rows[0]?.ready !== 1) {
				throw new Error('Postgres query check tidak mengembalikan 1');
			}
		} finally {
			await pool.end();
		}
	}

	private async ensureMinioBucket(minioConfig: IDisposableStackEndpoints['minio']): Promise<void> {
		const client = new Minio.Client({
			endPoint: minioConfig.host,
			port: minioConfig.port,
			useSSL: false,
			accessKey: minioConfig.accessKey,
			secretKey: minioConfig.secretKey
		});

		const exists = await client.bucketExists(minioConfig.bucket);
		if (!exists) {
			await client.makeBucket(minioConfig.bucket, 'us-east-1');
		}
		// Sama dengan infra (`mc anonymous set public`): bucket public read+write, URL tanpa signature.
		await client.setBucketPolicy(minioConfig.bucket, JSON.stringify(publicBucketPolicy(minioConfig.bucket)));
	}

	public stopSync(): void {
		try {
			spawnSync('docker', ['compose', '-p', this.projectName, '-f', this.composeFile, 'down', '-v', '--remove-orphans'], {
				env: this.env,
				stdio: 'ignore'
			});
		} finally {
			this.isStarted = false;
			this.endpoints = null;
		}
	}

	public async stop(): Promise<void> {
		if (!this.isStarted) return;
		try {
			this.compose(['down', '-v', '--remove-orphans']);
		} finally {
			this.isStarted = false;
			this.endpoints = null;
		}
	}
}
