import './libs/config/init-env';
import './libs/config/init-logger';
import './libs/helpers/initModuleAlias';
import { dump } from '@knittotextile/knitto-core-backend';
import httpServer from '@http/index';

// import messageBroker from '@/app/messageBroker';
import mysqlConnection from './libs/config/mysqlConnection';
import { RECORDING_FEATURE_ENABLED } from './libs/config';
import {
	assertRecordingInfraConfigured,
	currentRecordingInfraSettings
} from './libs/config/recording-infra';
// import rabbitConnection from './libs/config/rabbitConnection';

(
	async () => {
		try {
			// Fitur recording wajib punya konfigurasi AI + MinIO lengkap saat diaktifkan.
			if (RECORDING_FEATURE_ENABLED) assertRecordingInfraConfigured(currentRecordingInfraSettings());

			// start infrastructure
			await mysqlConnection.init();
			// await rabbitConnection.init();

			// start application
			await httpServer();
			// await messageBroker();
		} catch (error) {
			dump(error);
			process.exit(1);
		}
	}
)();
