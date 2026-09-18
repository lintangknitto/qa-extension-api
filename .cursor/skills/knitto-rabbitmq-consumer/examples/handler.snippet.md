# Handler (contoh generik)

File: `consumers/<domain>/<domain>.handler.ts` — fungsi `process*`. **DILARANG** try-catch; throw error langsung agar retry/DLQ broker jalan.

## Event create

```typescript
import mysqlConnection from '@/libs/config/mysqlConnection';
import { TCreateWidgetAcmeRequestValidation } from './widget-acme.request';

export const processCreateWidgetAcme = async (
	payload: TCreateWidgetAcmeRequestValidation
): Promise<void> => {
	await mysqlConnection.transaction(async tx => {
		const [existing] = await tx.raw<Array<{ sku: string }>>(
			'SELECT sku FROM widgets WHERE sku = ? LIMIT 1',
			[payload.sku]
		);

		if (existing) {
			return;
		}

		await tx.raw(
			'INSERT INTO widgets (sku, qty) VALUES (?, ?)',
			[payload.sku, payload.qty]
		);
	});
};
```

## Event update

```typescript
import mysqlConnection from '@/libs/config/mysqlConnection';
import { TUpdateWidgetAcmeRequestValidation } from './widget-acme.request';

export const processUpdateWidgetAcme = async (
	payload: TUpdateWidgetAcmeRequestValidation
): Promise<void> => {
	await mysqlConnection.transaction(async tx => {
		await tx.raw('UPDATE widgets SET qty = ? WHERE sku = ?', [
			payload.qty,
			payload.sku
		]);
	});
};
```

Flow kompleks (multi-repo, external API) — pecah helper/domain; tetap throw tanpa try-catch di handler.
