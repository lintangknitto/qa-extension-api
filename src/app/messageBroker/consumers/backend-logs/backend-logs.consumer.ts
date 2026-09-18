import { logger } from '@knittotextile/knitto-core-backend';
import { createConsumer } from '@knittotextile/knitto-rabbitmq';
import { rabbitMQConfig } from '@/libs/config';
import { processBackendLog } from './backend-logs.handler';

const queueName = 'backendLogs';

const consumer = createConsumer({
	exchangeName: rabbitMQConfig.EXCHANGE,
	queue: queueName,
	prefetch: 1
});

consumer.add('user.created', async (msg) => {
	await processBackendLog(msg.data);
});

logger.info(`Backend logs consumer initialized, queue: ${queueName}`);

export default consumer;
