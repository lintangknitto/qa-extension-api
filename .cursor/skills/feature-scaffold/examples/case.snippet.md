# Use-case (contoh generik) — ctx style

File: `use-case/{verb}-{noun}.case.ts`. **WAJIB** ctx dengan `req`. **DILARANG** try-catch.

```typescript
import { Request } from 'express';
import { InvalidParameterException } from '@knittotextile/knitto-core-backend';
import { TCreateWidgetValidation } from '../widget-acme.request';
import * as queries from '../queries/widget-acme.queries';
import * as domain from '../domain/widget-acme.domain';
import WidgetAcmeRepo from '../repo/widget-acme.repo';

export const createWidgetUseCase = async (ctx: {
	req: Request;
	data: TCreateWidgetValidation;
}) => {
	domain.assertSkuFormat(ctx.data.sku);

	const existing = await queries.getWidgetBySku(ctx.data.sku);
	if (existing) {
		throw new InvalidParameterException('SKU sudah digunakan', {
			sku: ctx.data.sku
		});
	}

	const repo = new WidgetAcmeRepo();
	await repo.insertWidget({
		sku: ctx.data.sku,
		qty: ctx.data.qty,
		createdBy: ctx.req.userId
	});

	return { sku: ctx.data.sku };
};
```

## Tanpa field tambahan selain req

```typescript
import { Request } from 'express';
import * as queries from '../queries/widget-acme.queries';

export const listWidgetsDashboardUseCase = async (ctx: { req: Request }) => {
	return await queries.listWidgetsForDashboard();
};
```

- Satu export per file; nama `verb-noun.case.ts`
- `req` wajib di ctx meski tidak dipakai
- Panggil queries/repo tanpa try-catch; error di-throw langsung
