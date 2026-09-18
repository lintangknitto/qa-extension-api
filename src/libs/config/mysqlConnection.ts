import { MySqlConnector } from '@knittotextile/knitto-mysql';
import { mysqlConfig, DEBUG_QUERY } from '.';

const mysqlConnection = new MySqlConnector(
	{
		host: mysqlConfig.HOST,
		database: mysqlConfig.NAME,
		port: Number(mysqlConfig.PORT),
		user: mysqlConfig.USER,
		password: mysqlConfig.PASSWORD,
		connectionLimit: 20,
		dateStrings: true,
		maxPreparedStatements: 200
	},
	DEBUG_QUERY === 'true'
);

export default mysqlConnection;
