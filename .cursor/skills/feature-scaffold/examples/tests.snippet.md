# Unit test (contoh generik)

Unit test **wajib** untuk domain dan helper (per boilerplate). Mock I/O di integration test terpisah.

---

## Domain — `__tests__/domain/widget-acme.domain.spec.ts`

```typescript
import * as domain from '../../domain/widget-acme.domain';
import { InvalidParameterException } from '@knittotextile/knitto-core-backend';

describe('widget-acme.domain', () => {
	describe('assertSkuFormat', () => {
		it('melempar jika sku terlalu pendek', () => {
			expect(() => domain.assertSkuFormat('AB')).toThrow(InvalidParameterException);
		});

		it('menerima sku valid', () => {
			expect(() => domain.assertSkuFormat('ABC')).not.toThrow();
		});
	});

	describe('calculateDiscountedPrice', () => {
		it('menerapkan diskon', () => {
			expect(domain.calculateDiscountedPrice(100, 10)).toBe(90);
		});

		it('melempar jika diskon di luar range', () => {
			expect(() => domain.calculateDiscountedPrice(100, 150)).toThrow(
				InvalidParameterException
			);
		});
	});
});
```

---

## Helper — `__tests__/helper/widget-acme.helper.spec.ts`

```typescript
import * as helper from '../../helper/widget-acme.helper';

describe('widget-acme.helper', () => {
	describe('formatWidgetLabel', () => {
		it('menggabungkan sku dan label', () => {
			expect(helper.formatWidgetLabel('SKU1', 'Widget A')).toBe('SKU1 — Widget A');
		});
	});
});
```

---

**Catatan:** Use-case diuji via integration test atau end-to-end. Domain dan helper diuji sebagai pure functions tanpa mock DB.
