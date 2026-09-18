# Query (contoh generik) — `queries/*.queries.ts`

Fungsi SELECT di `queries/`. Gunakan `mysqlConnection` atau terima connection jika perlu transaksi read-consistency. **DILARANG** try-catch.

```typescript
import mysqlConnection from '@/libs/config/mysqlConnection';

export const getWidgetBySku = async (sku: string) => {
	const [row] = await mysqlConnection.rawQuery<Array<{ sku: string; label: string }>>(
		'SELECT sku, label FROM widgets_acme WHERE sku = ? LIMIT 1',
		[sku]
	);
	return row ?? null;
};

export const listWidgetsForDashboard = async () => {
	return await mysqlConnection.raw<Array<{ sku: string; qty: number }>>(
		'SELECT sku, qty FROM widgets_acme ORDER BY sku ASC LIMIT 500',
		[]
	);
};

export const listWidgetsByStatus = async (filters: { status: string; limit?: number }) => {
	let query = 'SELECT sku, qty, status FROM widgets_acme WHERE status = ?';
	const params: unknown[] = [filters.status];

	if (filters.limit) {
		query += ' LIMIT ?';
		params.push(filters.limit);
	}

	return await mysqlConnection.raw<Array<{ sku: string; qty: number; status: string }>>(
		query,
		params
	);
};
```

- Fokus **baca** (SELECT)
- Mutasi (INSERT/UPDATE/DELETE) di `repo/*.repo.ts`
- Hindari aturan bisnis kompleks — taruh di domain/use-case
