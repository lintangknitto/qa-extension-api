# Request validation (contoh generik)

```typescript
import { InferOutput, object, string, number, minLength } from 'valibot';
import { basicValidationMessage } from '@knittotextile/knitto-http';

export const CreateWidgetValidation = object({
	sku: string([
		minLength(1, basicValidationMessage.required('SKU')),
		minLength(3, basicValidationMessage.minLength('SKU', 3))
	]),
	qty: number()
});

export const GetWidgetQueryValidation = object({
	status: string()
});

export type TCreateWidgetValidation = InferOutput<typeof CreateWidgetValidation>;
export type TGetWidgetQueryValidation = InferOutput<typeof GetWidgetQueryValidation>;
```

Gunakan di routes:

```typescript
requestValidator({ type: CreateWidgetValidation, requestType: 'body' })
requestValidator({ type: GetWidgetQueryValidation, requestType: 'query' })
```
