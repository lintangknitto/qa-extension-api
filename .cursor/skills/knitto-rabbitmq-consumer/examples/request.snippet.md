# Request validation (contoh generik)

File: `consumers/<domain>/<domain>.request.ts` — skema Valibot untuk payload di dalam message RabbitMQ.

```typescript
import { InferOutput, object, string, number, pipe, nonEmpty } from 'valibot';
import { ERROR_VALIDATION_MSG } from '@/libs/config/errorMessage';

export const createWidgetAcmeRequestValidation = object({
	event_id: pipe(
		string(ERROR_VALIDATION_MSG.string('event_id')),
		nonEmpty(ERROR_VALIDATION_MSG.required('event_id'))
	),
	sku: pipe(
		string(ERROR_VALIDATION_MSG.string('sku')),
		nonEmpty(ERROR_VALIDATION_MSG.required('sku'))
	),
	qty: number(ERROR_VALIDATION_MSG.number('qty'))
});

export const updateWidgetAcmeRequestValidation = object({
	event_id: pipe(
		string(ERROR_VALIDATION_MSG.string('event_id')),
		nonEmpty(ERROR_VALIDATION_MSG.required('event_id'))
	),
	sku: pipe(
		string(ERROR_VALIDATION_MSG.string('sku')),
		nonEmpty(ERROR_VALIDATION_MSG.required('sku'))
	),
	qty: number(ERROR_VALIDATION_MSG.number('qty'))
});

export type TCreateWidgetAcmeRequestValidation = InferOutput<
	typeof createWidgetAcmeRequestValidation
>;
export type TUpdateWidgetAcmeRequestValidation = InferOutput<
	typeof updateWidgetAcmeRequestValidation
>;
```

**Catatan:** Validasi di `*.request.ts` untuk dokumentasi tipe; parse/validasi runtime di handler jika diperlukan (`parse()` dari Valibot).
