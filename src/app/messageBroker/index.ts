import { logger } from '@knittotextile/knitto-core-backend';
import rabbitConnection from '@/libs/config/rabbitConnection';
import path from 'path';

async function listener() {
	try {
		await rabbitConnection.subscribe(path.join(__dirname, './consumers'), {
			pattern: '**/*.consumer.ts'
		});
	} catch (err) {
		logger.error('RabbitMQ Apps Error');
		throw err;
	}
}

export default listener;
