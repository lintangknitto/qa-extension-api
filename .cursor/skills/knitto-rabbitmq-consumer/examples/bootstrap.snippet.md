# Bootstrap subscribe (contoh generik)

Entry message broker — load semua `*.consumer.ts` dari folder `consumers/`.

```typescript
import path from 'path';
import { logger } from '@knittotextile/knitto-core-backend';
import rabbitConnection from '@/libs/config/rabbitConnection';

async function listener() {
	try {
		await rabbitConnection.subscribe(path.join(__dirname, './consumers'), {
			pattern: '**/*.consumer.ts'
		});
	} catch (err) {
		logger.error('RabbitMQ Apps Error');
		throw err;
	}
}

export default listener;
```

| Pattern | Match |
|---------|-------|
| `**/*.consumer.ts` | Recursive; auto match `.consumer.js` hasil build |
| `*.consumer.ts` | Hanya file di root folder consumers |

**Path `dist/`:** sesuaikan `__dirname` relatif antara file bootstrap dan folder `consumers/` setelah `tsc` build.

**Startup app:** `await rabbitConnection.init()` sebelum `listener()` — lihat `src/index.ts`.
