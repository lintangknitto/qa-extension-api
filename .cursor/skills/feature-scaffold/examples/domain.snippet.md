# Domain (contoh generik)

Pure functions di `domain/*.domain.ts`. **DILARANG** try-catch dan side effects (I/O, DB).

```typescript
import { InvalidParameterException, NotFoundException } from '@knittotextile/knitto-core-backend';

type WidgetRow = { sku: string; label: string; status: string };

export const assertSkuFormat = (sku: string): void => {
	if (!sku || sku.length < 3) {
		throw new InvalidParameterException('SKU minimal 3 karakter', { sku });
	}
};

export const validateWidgetExists = (row: WidgetRow | null): WidgetRow => {
	if (!row) {
		throw new NotFoundException('Widget tidak ditemukan');
	}
	return row;
};

export const validateWidgetActive = (row: WidgetRow): void => {
	if (row.status !== 'ACTIVE') {
		throw new InvalidParameterException('Widget tidak aktif', { sku: row.sku });
	}
};

export const calculateDiscountedPrice = (price: number, discountPercent: number): number => {
	if (discountPercent < 0 || discountPercent > 100) {
		throw new InvalidParameterException('Diskon harus 0-100', { discountPercent });
	}
	return price * (1 - discountPercent / 100);
};
```

Export named functions (bukan default export objek). Unit test wajib di `__tests__/domain/*.domain.spec.ts`.
