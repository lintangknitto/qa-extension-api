# Multi-route satu queue (contoh generik)

Beberapa `consumer.add()` pada queue sama → **satu** AMQP consumer; dispatch by routing key (bukan round-robin).

```typescript
import { createConsumer } from '@knittotextile/knitto-rabbitmq';
import { rabbitMQConfig } from '@/libs/config';

const consumer = createConsumer({
	exchangeName: rabbitMQConfig.EXCHANGE,
	queue: 'SHARED_WIDGET_QUEUE',
	prefetch: 1
});

consumer.add('widget.acme.created', async msg => {
	await processCreateWidgetAcme(msg.data.data.payload);
});

consumer.add('widget.acme.updated', async msg => {
	await processUpdateWidgetAcme(msg.data.data.payload);
});

consumer.add('widget.acme.deleted', async msg => {
	await processDeleteWidgetAcme(msg.data.data.payload);
});

export default consumer;
```

## Wildcard

```typescript
// Match: widget.acme.payment.created, widget.acme.shipping.created
consumer.add('widget.acme.*.created', handleCreated);

// Match: semua event di bawah widget.acme
consumer.add('widget.acme.#', handleAllWidgetAcmeEvents);
```

| Karakter | Arti |
|----------|------|
| `*` | Satu segmen (antar dot) |
| `#` | Nol atau lebih segmen |

**Satu `add()` = satu route string** — untuk banyak routing key, panggil `add()` berkali-kali (bukan array).
