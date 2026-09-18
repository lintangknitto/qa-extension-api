# Repository (contoh generik) — `repo/*.repo.ts`

Kelas `extends BaseRepository` dari `@/libs/helpers/BaseRepository`. Mutasi via `this.getConnection()`. **DILARANG** try-catch dan import `mysqlConnection` langsung.

```typescript
import BaseRepository from '@/libs/helpers/BaseRepository';
import { MySqlResultSetHeader } from '@knittotextile/knitto-mysql/dist/libs/MySqlConnector';

export default class WidgetAcmeRepo extends BaseRepository {
	async insertWidget(data: { sku: string; qty: number; createdBy?: number }) {
		const conn = this.getConnection();
		await conn.raw<MySqlResultSetHeader>(
			'INSERT INTO widgets_acme (sku, qty, created_by) VALUES (?, ?, ?)',
			[data.sku, data.qty, data.createdBy ?? null]
		);
	}

	async updateWidgetQty(data: { sku: string; qty: number }) {
		const conn = this.getConnection();
		await conn.raw<MySqlResultSetHeader>(
			'UPDATE widgets_acme SET qty = ? WHERE sku = ?',
			[data.qty, data.sku]
		);
	}

	async decrementQty(data: { sku: string; qty: number }) {
		const conn = this.getConnection();
		await conn.raw<MySqlResultSetHeader>(
			'UPDATE widgets_acme SET qty = qty - ? WHERE sku = ?',
			[data.qty, data.sku]
		);
	}

	async deleteWidgetBySku(sku: string) {
		const conn = this.getConnection();
		await conn.raw<MySqlResultSetHeader>(
			'DELETE FROM widgets_acme WHERE sku = ?',
			[sku]
		);
	}
}
```

**Transaksi:** `new WidgetAcmeRepo(mysqlConnection)` dengan connection yang sama di semua repo dalam satu transaksi.

**Baca** (SELECT) tetap di `queries/*.queries.ts`.
