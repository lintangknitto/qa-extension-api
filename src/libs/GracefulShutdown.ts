import { logger } from '@knittotextile/knitto-core-backend';
import http from 'http';
import { ExpressType } from '@knittotextile/knitto-http';

/**
 * Interface untuk proses shutdown yang akan dieksekusi
 */
interface ShutdownProcess {
	/** Nama proses yang akan ditutup */
	name: string;
	/** Fungsi yang akan dieksekusi saat shutdown */
	fn: () => Promise<void> | void;
}

/**
 * Kelas untuk menangani graceful shutdown pada server HTTP
 *
 * Kelas ini menyediakan mekanisme untuk:
 * 1. Menangani sinyal SIGINT dan SIGTERM
 * 2. Menutup server secara graceful
 * 3. Mengeksekusi proses cleanup yang terdaftar
 * 4. Memantau request yang aktif saat shutdown
 *
 * @example
 * ```typescript
 * const server = http.createServer(app);
 * const gracefulShutdown = new GracefulShutdown(server);
 *
 * // Daftarkan proses yang perlu ditutup
 * gracefulShutdown.register('database', async () => {
 *   await db.close();
 * });
 *
 * // Gunakan middleware untuk memantau request
 * app.use(gracefulShutdown.middleware());
 * ```
 */
export default class GracefulShutdown {
	private readonly shutdownProcesses: ShutdownProcess[] = [];
	private server?: http.Server;
	private isShuttingDown = false;

	private activeRequests = 0;
	private successResponses = 0;
	private errorResponses = 0;

	/**
	 * Membuat instance GracefulShutdown
	 * @param server - Server HTTP yang akan ditutup secara graceful
	 */
	constructor(server?: http.Server) {
		this.server = server;
		this.setupSignalHandlers();
	}

	/**
	 * Mengatur server HTTP yang akan ditutup
	 * @param server - Server HTTP yang akan ditutup secara graceful
	 */
	setServer(server: http.Server) {
		this.server = server;
	}

	/**
	 * Mendaftarkan proses yang perlu ditutup saat shutdown
	 * @param name - Nama proses yang akan ditutup
	 * @param fn - Fungsi yang akan dieksekusi untuk menutup proses
	 */
	register(name: string, fn: () => Promise<void> | void) {
		this.shutdownProcesses.push({ name, fn });
	}

	/**
	 * Middleware Express untuk memantau request yang aktif
	 *
	 * Middleware ini akan:
	 * 1. Menghitung jumlah request yang aktif
	 * 2. Menolak request baru saat server sedang shutdown
	 * 3. Memantau response status untuk statistik
	 *
	 * @returns Middleware Express
	 */
	middleware = () => (_: ExpressType.Request, res: ExpressType.Response, next: ExpressType.NextFunction) => {
		this.activeRequests++;

		if (this.isShuttingDown) {
			res.setHeader('Connection', 'close');
			res.status(500).json({
				message: 'Server is shutting down',
				result: null
			});
			return;
		}

		res.on('finish', () => {
			this.activeRequests--;

			if (this.isShuttingDown) {
				if (res.statusCode >= 200 && res.statusCode < 300) {
					this.successResponses++;
				} else if (res.statusCode >= 400) {
					this.errorResponses++;
				}
			}
		});

		next();
	};

	/**
	 * Mengatur handler untuk sinyal SIGINT dan SIGTERM
	 * @private
	 */
	private setupSignalHandlers() {
		const shutdownHandler = (signal: string) => () => {
			this.shutdown(signal).catch((err) => {
				logger.error({ err, signal }, 'Error during shutdown');
				process.exit(1);
			});
		};

		process.once('SIGINT', shutdownHandler('SIGINT'));
		process.once('SIGTERM', shutdownHandler('SIGTERM'));
	}

	/**
	 * Melakukan proses shutdown secara graceful
	 *
	 * Proses shutdown meliputi:
	 * 1. Menutup server HTTP
	 * 2. Mengeksekusi semua proses cleanup yang terdaftar
	 * 3. Mencatat statistik request
	 * 4. Mengakhiri proses dengan exit code 0
	 *
	 * @param signal - Sinyal yang memicu shutdown (SIGINT/SIGTERM)
	 * @private
	 */
	private async shutdown(signal: string) {
		if (this.isShuttingDown) { return; }
		this.isShuttingDown = true;

		logger.info(`Received ${signal}. Server is shutting down...`);
		logger.info(`Active Requests at Shutdown: ${this.activeRequests}`);

		try {
			if (this.server) {
				logger.info('Closing server...');
				await new Promise<void>((resolve, reject) => {
					this.server.close((err) => {
						if (err) { reject(err); } else { resolve(); }
					});
				});
				logger.info('Server closed.');
			}

			for (const { name, fn } of this.shutdownProcesses) {
				logger.info(`Closing ${name}...`);
				await fn();
				logger.info(`${name} closed.`);
			}

			logger.info('Request stats after shutdown initiated:');
			logger.info(`  ├─ Success responses  : ${this.successResponses}`);
			logger.info(`  └─ Failed responses   : ${this.errorResponses}`);
			logger.info('Successful graceful shutdown.');
		} catch (err) {
			logger.error({ err }, 'Error during shutdown');
		} finally {
			process.exit(0);
		}
	}
}
