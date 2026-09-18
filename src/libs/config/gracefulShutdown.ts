import GracefulShutdown from '@/libs/GracefulShutdown';
// import mysqlConnection from './mysqlConnection';
// import rabbitConnection from './rabbitConnection'; // Uncomment jika service menggunakan RabbitMQ

const gracefulShutdown = new GracefulShutdown();

// gracefulShutdown.register('MySQL Database', async () => {
// 	await mysqlConnection.poolConnection.end();
// });

// Uncomment jika service menggunakan RabbitMQ
// gracefulShutdown.register('RabbitMQ', async () => {
// 	await rabbitConnection.shutdown(10000); // Timeout 10 seconds
// });

export default gracefulShutdown;
