import { DBAdapter } from '@knittotextile/knitto-mysql/dist/types/DBAdapter';
import mysqlConnection from './config/mysqlConnection';

export default class BaseRepository {
	private dbConnection: DBAdapter.IDBAdapter;

	constructor(dbConnection?: DBAdapter.IDBAdapter) {
		const connection = dbConnection ? dbConnection : mysqlConnection;
		this.setConnection(connection);
	}

	getConnection() {
		return this.dbConnection;
	}

	setConnection(dbConnection: DBAdapter.IDBAdapter) {
		this.dbConnection = dbConnection;

		return this;
	}

	resetConnection() {
		this.dbConnection = mysqlConnection;

		return this;
	}
}
