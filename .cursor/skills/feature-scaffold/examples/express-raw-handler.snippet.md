# Handler Express mentah (tanpa `TRequestFunction`)

Dipakai untuk unduh file, streaming, `Content-Disposition`, upload multipart — respons bukan JSON standar `{ message, result }`.

**Kontrak use-case tetap ctx style** `{ req, ... }` — handler mengekstrak data dari `req`, lalu memanggil use-case.

Selaras [`routes.snippet.md`](./routes.snippet.md): export **`Router()`** dari `@knittotextile/knitto-http`.

Tipe `req`/`res`: **`ExpressType.Request`** / **`ExpressType.Response`** dari `@knittotextile/knitto-http` (bukan import langsung dari `express`).

## Route — handler `(req, res)` di `*.routes.ts`

```typescript
import { Router, ExpressType } from '@knittotextile/knitto-http';
import { exportWidgetsCsvRaw } from './widget-acme-export.raw';

const router = Router();

router.get('/widgets/acme/export.csv', async (req: ExpressType.Request, res: ExpressType.Response) => {
	await exportWidgetsCsvRaw(req, res);
});

export default router;
```

**Jangan** membungkus handler file/stream dengan `requestHandler` — itu untuk `TRequestFunction` (JSON). Error non-JSON tangani di handler (try/catch + `res.status` bila perlu) atau lempar ke middleware error Express.

## Handler — ekstrak dari req, panggil use-case ctx

```typescript
import { ExpressType } from '@knittotextile/knitto-http';
import { buildWidgetsCsvUseCase } from './use-case/build-widgets-csv.case';

export async function exportWidgetsCsvRaw(
	req: ExpressType.Request,
	res: ExpressType.Response
): Promise<void> {
	const skuPrefix = typeof req.query.prefix === 'string' ? req.query.prefix : '';

	const csv = await buildWidgetsCsvUseCase({ req, skuPrefix });

	res.status(200);
	res.setHeader('Content-Type', 'text/csv; charset=utf-8');
	res.setHeader('Content-Disposition', 'attachment; filename="widgets-acme.csv"');
	res.send(csv);
}
```

## Use-case — ctx `{ req, ... }`

```typescript
import { ExpressType } from '@knittotextile/knitto-http';
import * as queries from '../queries/widget-acme.queries';

export const buildWidgetsCsvUseCase = async (ctx: {
	req: ExpressType.Request;
	skuPrefix: string;
}): Promise<string> => {
	const rows = await queries.listWidgetsForExport(ctx.skuPrefix);
	const header = 'sku,qty\n';
	const body = rows.map((r) => `${r.sku},${r.qty}`).join('\n');
	return header + body;
};
```

## Upload (ilustrasi)

Middleware multer memasang `req.file`. Handler membaca path/buffer, lalu:

```typescript
await importWidgetsUseCase({ req, tmpPath: req.file!.path, originalName: req.file!.originalname });
```

**Ringkasan:** JSON CRUD → `TRequestFunction` + `requestHandler`. File/streaming → `Router().get/post(..., handler)` + `(req, res)` + use-case ctx `{ req, ... }`.
