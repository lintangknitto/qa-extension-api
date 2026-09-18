# Publisher (contoh generik)

File: `publishers/<nama>.publisher.ts` — satu singleton `rabbitConnection`, log + re-throw on error.

```typescript
import { logger } from '@knittotextile/knitto-core-backend';
import rabbitConnection from '@/libs/config/rabbitConnection';
import { rabbitMQConfig } from '@/libs/config';

async function publishWidgetAcmeEvent(
	message: Record<string, unknown>,
	routingKey: string
) {
	try {
		await rabbitConnection.publishMessage(message, {
			exchangeName: rabbitMQConfig.EXCHANGE,
			routingKey
		});
	} catch (err) {
		logger.error(err);
		throw err;
	}
}

export default publishWidgetAcmeEvent;
```

Format message otomatis di-wrap library (`meta` + `data`). Routing key di `publishMessage` harus match route di `consumer.add()`.
