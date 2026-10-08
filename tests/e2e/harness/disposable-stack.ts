import { execSync, spawnSync } from 'child_process';
import path from 'path';
import crypto from 'crypto';
import { Pool } from 'pg';
import * as Minio from 'minio';

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

		const postgresUser = config.postgresUser || `e2e_user_${randomSuffix}`;
		const postgresPassword = config.postgresPassword || `e2e_pass_${randomSuffix}`;
		const postgresDb = config.postgresDb || `e2e_db_${randomSuffix}`;
		const minioAccessKey = config.minioAccessKey || `e2e_minio_${randomSuffix}`;
		const minioSecretKey = config.minioSecretKey || `e2e_sec_${randomSuffix}${randomSuffix}`;
		const minioBucket = config.minioBucket || 'qa-recording-artifacts';

		// SAFETY GUARD: Dilarang menggunakan database atau kredensial produksi / lokal persisten
		this.assertSafety({ postgresDb });

		this.env = {
			...process.env,
			E2E_POSTGRES_USER: postgresUser,
			E2E_POSTGRES_PASSWORD: postgresPassword,
			E2E_POSTGRES_DB: postgresDb,
			E2E_MINIO_ACCESS_KEY: minioAccessKey,
			E2E_MINIO_SECRET_KEY: minioSecretKey,
			E2E_MINIO_BUCKET: minioBucket
		};
	}

	public assertSafety(params: { postgresDb?: string; postgresPort?: number; postgresHost?: string }): void {
		if (params.postgresDb && params.postgresDb.toLowerCase() === 'knitto_qa') {
			throw new Error('SAFETY GUARD VIOLATION: Dilarang menghubungkan E2E harness ke database persisten knitto_qa.');
		}
		if (params.postgresPort === 5432 && (!params.postgresHost || params.postgresHost === 'localhost' || params.postgresHost === '127.0.0.1')) {
			throw new Error('SAFETY GUARD VIOLATION: Dilarang memakai port default PostgreSQL persisten 5432.');
		}
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
		const stdout = execSync(
			`docker compose -p "${this.projectName}" -f "${this.composeFile}" port ${service} ${containerPort}`,
			{ env: this.env, encoding: 'utf-8' }
		).trim();

		// Format output: 0.0.0.0:12345 atau [::]:12345 atau 127.0.0.1:12345
		const match = stdout.match(/:(\d+)$/);
		if (!match || !match[1]) {
			throw new Error(`Gagal mengambil port yang dipublikasikan untuk service ${service}:${containerPort}. Output: ${stdout}`);
		}
		return parseInt(match[1], 10);
	}

	public async start(): Promise<IDisposableStackEndpoints> {
		this.registerProcessHooks();

		// Start compose stack dengan project name terisolasi
		execSync(
			`docker compose -p "${this.projectName}" -f "${this.composeFile}" up -d --wait`,
			{ env: this.env, stdio: ['pipe', 'pipe', 'pipe'] }
		);
		this.isStarted = true;

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
	}

	public stopSync(): void {
		try {
			spawnSync(
				'docker',
				['compose', '-p', this.projectName, '-f', this.composeFile, 'down', '-v', '--remove-orphans'],
				{ stdio: 'ignore' }
			);
		} finally {
			this.isStarted = false;
			this.endpoints = null;
		}
	}

	public async stop(): Promise<void> {
		if (!this.isStarted) return;
		try {
			execSync(
				`docker compose -p "${this.projectName}" -f "${this.composeFile}" down -v --remove-orphans`,
				{ stdio: 'pipe' }
			);
		} finally {
			this.isStarted = false;
			this.endpoints = null;
		}
	}
}
