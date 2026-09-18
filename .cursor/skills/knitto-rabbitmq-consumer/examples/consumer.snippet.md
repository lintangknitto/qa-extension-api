# Consumer (contoh generik)

File: `consumers/<domain>/<domain>.consumer.ts` — **tipis**: wiring RabbitMQ saja. **WAJIB** `export default consumer`.

```typescript
import { logger } from '@knittotextile/knitto-core-backend';
import { createConsumer } from '@knittotextile/knitto-rabbitmq';
import { rabbitMQConfig } from '@/libs/config';
import {
	TCreateWidgetAcmeRequestValidation,
	TUpdateWidgetAcmeRequestValidation
} from './widget-acme.request';
import {
	processCreateWidgetAcme,
	processUpdateWidgetAcme
} from './widget-acme.handler';

const queueName = 'WIDGET_ACME_QUEUE';

const consumer = createConsumer({
	exchangeName: rabbitMQConfig.EXCHANGE,
	queue: queueName,
	prefetch: 1,
	maxRetry: 5 // opsional — default dari defaultMaxRetry di rabbitConnection
});

consumer.add('widget.acme.created', async msg => {
	const payload = msg.data.data.payload as TCreateWidgetAcmeRequestValidation;
	await processCreateWidgetAcme(payload);
});

consumer.add('widget.acme.updated', async msg => {
	const payload = msg.data.data.payload as TUpdateWidgetAcmeRequestValidation;
	await processUpdateWidgetAcme(payload);
});

logger.info(`Widget acme consumer initialized, queue: ${queueName}`);

export default consumer;
```

**Urutan handler:** parse payload dari `msg.data` → panggil `process*` — tanpa try-catch (biarkan error naik ke library).

**Wildcard routing:** `consumer.add('widget.acme.*.created', handler)` — lihat `multi-route.snippet.md`.

**DILARANG:** business logic / query SQL di `*.consumer.ts`.
