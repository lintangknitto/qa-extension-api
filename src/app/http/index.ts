import { logger, dump } from '@knittotextile/knitto-core-backend';
import { createHttpServer, startHttpServer } from '@knittotextile/knitto-http';
import { APP_PORT_HTTP, OPENAPI_DOCS_ENABLED, RECORDING_FEATURE_ENABLED } from '@/libs/config';
import { initSocketIO } from '@/app/ws';
import { registerOpenApiDocs } from '@/libs/config/register-open-api-docs';
import path from 'path';
import authorizeMiddleware from '@/libs/middlewares/authorization.middleware';
import gracefulShutdown from '@/libs/config/gracefulShutdown';

async function httpServer(): Promise<void> {
	try {

		const server = createHttpServer({
			routerPath: {
				basePath: __dirname,
				exceptDir: [path.join(__dirname, 'middlewares')]
			},
			port: APP_PORT_HTTP,
			/**
			 * Secara default, semua endpoint dengan method PUT, PATCH, DELETE dan POST menggunakan idempotency request.
			 * Request dianggap sama jika request id sama. Default request id adalah hash dari ip client, user id (jika ada), method, dan path.
			 * Jika ingin bypass, tambahkan path ke list ini.
			 */
			listNotAllowedIdempotencyRequest: [],
			/**
			 * Secara default, semua endpoint perlu login.
			 * Jika ingin bypass pengecekan token, tambahkan path ke list ini.
			 */
			authorizationMiddleware: authorizeMiddleware
		});

		if (OPENAPI_DOCS_ENABLED) {
			await registerOpenApiDocs(server);
		}

		// Socket.IO hanya diaktifkan saat fitur recording menyala.
		if (RECORDING_FEATURE_ENABLED) initSocketIO(server.httpServer);

		gracefulShutdown.setServer(server.httpServer);

		await startHttpServer(server);
	} catch (error) {
		logger.error({ err: error }, 'HTTP server error');
		dump(error);
		throw error;
	}
}

export default httpServer;
