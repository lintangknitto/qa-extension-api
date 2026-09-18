# Controller (contoh generik)

Controller memakai `TRequestFunction`, return `{ message, result }`. Simple flow → queries langsung. Complex flow → use-case ctx `{ req, ... }`.

## Baca (simple — query langsung)

```typescript
import { TRequestFunction } from '@knittotextile/knitto-http';
import { NotFoundException } from '@knittotextile/knitto-core-backend';
import * as queries from './queries/widget-acme.queries';

export const getWidgetBySku: TRequestFunction = async (req) => {
	const { sku } = req.params;
	const widget = await queries.getWidgetBySku(sku);

	if (!widget) {
		throw new NotFoundException('Widget tidak ditemukan', { sku });
	}

	return { message: 'Success', result: widget };
};
```

## Tulis (complex — use-case)

```typescript
import { TRequestFunction } from '@knittotextile/knitto-http';
import { TCreateWidgetValidation } from './widget-acme.request';
import { createWidgetUseCase } from './use-case/create-widget.case';

export const createWidget: TRequestFunction = async (req) => {
	const data = req.body as TCreateWidgetValidation;

	const result = await createWidgetUseCase({ req, data });

	return { message: 'Widget berhasil dibuat', result, statusCode: 201 };
};
```

## Tulis dengan transaksi (multi-repo)

```typescript
import { TRequestFunction } from '@knittotextile/knitto-http';
import mysqlConnection from '@/libs/config/mysqlConnection';
import WidgetRepo from './repo/widget-acme.repo';
import StockRepo from './repo/stock.repo';
import { TTransferStockValidation } from './widget-acme.request';

export const transferStock: TRequestFunction = async (req) => {
	const data = req.body as TTransferStockValidation;

	try {
		await mysqlConnection.raw('START TRANSACTION');

		const widgetRepo = new WidgetRepo(mysqlConnection);
		const stockRepo = new StockRepo(mysqlConnection);

		await widgetRepo.decrementQty({ sku: data.sku, qty: data.qty });
		await stockRepo.incrementQty({ sku: data.sku, qty: data.qty });

		await mysqlConnection.raw('COMMIT');
	} catch (error) {
		await mysqlConnection.raw('ROLLBACK');
		throw error;
	}

	return { message: 'Stok berhasil ditransfer' };
};
```

Transaksi di controller diperbolehkan (try-catch untuk ROLLBACK). Layer queries/repo/use-case tetap tanpa try-catch.
