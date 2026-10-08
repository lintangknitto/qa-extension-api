import './libs/config/init-env';
import './libs/config/init-logger';
import './libs/helpers/initModuleAlias';
import { dump } from '@knittotextile/knitto-core-backend';
import httpServer from '@http/index';

import postgresConnection from './libs/config/postgresConnection';
import { APP_SECRET_KEY, RECORDING_FEATURE_ENABLED } from './libs/config';
import {
	assertRecordingInfraConfigured,
	currentRecordingInfraSettings
} from './libs/config/recording-infra';

(
	async () => {
	try {
		if (APP_SECRET_KEY.length < 32) {
			throw new Error('APP_SECRET_KEY harus diisi dengan secret minimal 32 karakter.');
		}

			// Fitur recording wajib punya konfigurasi AI + MinIO lengkap saat diaktifkan.
			if (RECORDING_FEATURE_ENABLED) assertRecordingInfraConfigured(currentRecordingInfraSettings());

			// Verify postgres connection
			const pool = await postgresConnection.getPool();
			await pool.query('SELECT 1');
			console.log('✅ PostgreSQL connection pool initialized.');

			// start application
			await httpServer();
		} catch (error) {
			dump(error);
			process.exit(1);
		}
	}
)();
