/**
 * File ini berfungsi untuk melakukan inisialisasi module alias pada hasil build
 */

import moduleAlias from 'module-alias';
import { logger } from '@knittotextile/knitto-core-backend';
import path from 'path';

(async () => {
	try {
		/** tsx (pnpm dev) mengisi execArgv dengan loader tsx; node dist/index.js (pnpm start) tidak. */
		const isRunningViaTsx = () =>
			process.execArgv.some((arg) => String(arg).includes('tsx'));

		if (!isRunningViaTsx()) {
			moduleAlias.addAliases({
				'@': path.join(process.cwd(), 'dist'),
				'@http': path.join(process.cwd(), 'dist/app/http/'),
				'@httpController': path.join(
					process.cwd(),
					'dist/app/http/controller/'
				),
				'@httpMiddlewares': path.join(process.cwd(), 'dist/app/http/middleware/'),
				'@repositories': path.join(process.cwd(), 'dist/repositories/'),
				'@libs': path.join(process.cwd(), 'dist/libs/'),
				'@services': path.join(process.cwd(), 'dist/services/')
			});

			moduleAlias();
		}
	} catch (error) {
		logger.error(error);
		process.exit(0);
	}
})();
