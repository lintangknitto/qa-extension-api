# Routes (contoh generik) — `Router()` + `requestHandler`

Selaras [`@knittotextile/knitto-http`](../../../../node_modules/@knittotextile/knitto-http/README.md) § *Membuat Route File* dan modul nyata [`auth.routes.ts`](../../../../src/app/http/auth/auth.routes.ts) / [`home.routes.ts`](../../../../src/app/http/home/home.routes.ts).

File `{feature}.routes.ts` di-export **`default`** sebagai instance `Router()`; auto-routing memuat `**/*.routes.ts` dari `src/app/http/`.

```typescript
import { Router, requestHandler, requestValidator } from '@knittotextile/knitto-http';
import controller from './widget-acme.controller';
import { CreateWidgetValidation, GetWidgetQueryValidation } from './widget-acme.request';

const router = Router();

router.get(
	'/widgets/acme',
	requestValidator({
		requestType: 'query',
		type: GetWidgetQueryValidation
	}),
	requestHandler(controller.listWidgets)
);

router.get('/widgets/acme/:sku', requestHandler(controller.getWidgetBySku));

router.post(
	'/widgets/acme',
	requestValidator({
		requestType: 'body',
		type: CreateWidgetValidation
	}),
	requestHandler(controller.createWidget)
);

export default router;
```

**Urutan middleware per route:** `requestValidator` (jika ada) → `requestHandler(controller.method)`.

**Controller:** export default object method (`login`, `listWidgets`, …) seperti auth, atau named export + `import * as controller` — konsisten dalam satu modul.

**DILARANG:** `Router` dari `express` langsung — impor dari `@knittotextile/knitto-http`.

**DILARANG:** controller JSON tanpa `requestHandler` (error handling & response standar Knitto).

**Opsional:** komentar JSDoc singkat (`@summary`) di atas route — **tidak wajib**. Kontrak publish = sync manual [`docs/openapi/openapi.yaml`](../../../../docs/openapi/openapi.yaml) (Valibot di `*.request.ts` = sumber bentuk body/query; jangan duplikasi `@typedef` di JSDoc). Lihat [`knitto-http.mdc`](../../../rules/knitto-http.mdc).

**Kasus khusus** (unduh file, streaming, bukan JSON): lihat [`express-raw-handler.snippet.md`](./express-raw-handler.snippet.md).
