import { logger } from '@knittotextile/knitto-core-backend';

export const processBackendLog = async (data: unknown) => {
	logger.info(JSON.stringify(data));
};
