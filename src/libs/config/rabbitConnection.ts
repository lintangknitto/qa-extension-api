import KnittoRabbitMQ from '@knittotextile/knitto-rabbitmq';
import { rabbitMQConfig } from '.';

const rabbitConnection = new KnittoRabbitMQ({
	connectionName: 'rabbit-connection',
	url: rabbitMQConfig.EXCHANGE
});

export default rabbitConnection;
