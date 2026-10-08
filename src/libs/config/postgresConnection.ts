import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { postgresConfig, DEBUG_QUERY } from '.';

export class PostgresConnector {
	private pool: Pool;
	private debug: boolean;

	constructor(debug = false) {
		this.debug = debug;
		this.pool = new Pool({
			host: postgresConfig.HOST,
			port: postgresConfig.PORT,
			user: postgresConfig.USER,
			password: postgresConfig.PASSWORD,
			database: postgresConfig.NAME,
			max: 20,
			idleTimeoutMillis: 30000,
			connectionTimeoutMillis: 5000
		});

		this.pool.on('error', (err) => {
			console.error('Unexpected error on idle PostgreSQL client:', err.message);
		});
	}

	/**
	 * Translates legacy positional placeholders while the query modules are migrated.
	 */
	private formatQuery(query: string): string {
		let index = 1;
		return query.replace(/\?/g, () => `$${index++}`);
	}

	/**
	 * Eksekusi raw SQL query dengan parameter.
	 * Mengembalikan res.rows secara default untuk kemudahan query DTO.
	 */
	public async raw<T = QueryResultRow[]>(query: string, params: unknown[] = []): Promise<T> {
		const formattedSql = this.formatQuery(query);
		const start = Date.now();

		try {
			const res: QueryResult = await this.pool.query(formattedSql, params);
			const duration = Date.now() - start;

			if (this.debug) {
				// Never log bound values: queries may contain passwords, tokens, or PII.
				console.log(`[POSTGRES] (${duration}ms) ${formattedSql}`);
			}

			// Mengembalikan array rows (atau result header untuk kompatibilitas jika diakses)
			return res.rows as unknown as T;
		} catch (error) {
			const duration = Date.now() - start;
			console.error(`[POSTGRES ERROR] (${duration}ms) ${formattedSql} -- error:`, (error as Error).message);
			throw error;
		}
	}

	/**
	 * Menjalankan block kode di dalam database transaction.
	 */
	public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
		const client = await this.pool.connect();
		try {
			await client.query('BEGIN');
			const result = await callback(client);
			await client.query('COMMIT');
			return result;
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	}

	public async getPool(): Promise<Pool> {
		return this.pool;
	}

	public async end(): Promise<void> {
		await this.pool.end();
	}
}

const postgresConnection = new PostgresConnector(DEBUG_QUERY === 'true');
export default postgresConnection;
