---
name: knitto-rabbitmq-consumer
description: >-
  Playbook consumer RabbitMQ v2 (createConsumer) untuk knitto-agent-feature
  atau knitto-agent-upgrade. Snippet di examples/; routing lewat orchestrator.
---

# Knitto RabbitMQ Consumer

Playbook consumer RabbitMQ — **standar layering** di [`boilerplate.mdc`](../../rules/boilerplate.mdc) (error handling, Valibot, alias `@/`). **API library:** `node_modules/@knittotextile/knitto-rabbitmq/README.md`.

**Contoh kode** ada di folder [`examples/`](./examples/).

## Struktur folder (rekomendasi)

```
src/app/messageBroker/
├── index.ts                 # subscribe ke folder consumers
├── publishers/              # publishMessage
└── consumers/
    └── <domain>/
        ├── <domain>.consumer.ts   # wiring: createConsumer + add(route)
        ├── <domain>.handler.ts    # orkestrasi / DB / business logic
        └── <domain>.request.ts    # Valibot schema + InferOutput types
```

| File | Tanggung jawab |
|------|----------------|
| `*.consumer.ts` | Tipis — `createConsumer`, `consumer.add`, export default |
| `*.handler.ts` | `process*` functions; throw error langsung (tanpa try-catch) |
| `*.request.ts` | Skema Valibot payload message |

## Checklist consumer domain baru

- [ ] `consumers/<domain>/<domain>.request.ts` — skema Valibot + export tipe
- [ ] `consumers/<domain>/<domain>.handler.ts` — `process*` per event/route
- [ ] `consumers/<domain>/<domain>.consumer.ts` — `createConsumer` + `add()` + export default
- [ ] Bootstrap sudah `subscribe('./consumers', { pattern: '**/*.consumer.ts' })`

**Kondisional:**

- [ ] Beberapa route pada queue sama — multiple `add()` di satu `*.consumer.ts`
- [ ] Wildcard routing — `*` / `#` di string route (`examples/multi-route.snippet.md`)

## Pola per layer

| Layer | Snippet |
|-------|---------|
| Request | `examples/request.snippet.md` |
| Handler | `examples/handler.snippet.md` |
| Consumer | `examples/consumer.snippet.md` |
| Bootstrap | `examples/bootstrap.snippet.md` |
| Publisher | `examples/publisher.snippet.md` |
| Multi-route | `examples/multi-route.snippet.md` |

## Format message

Publisher Knitto membungkus payload:

```typescript
// msg.meta — id, event (routing key), publisher, timestamp
// msg.data — payload publisher (sering: msg.data.data.payload)
```

Akses routing key asli: parameter kedua handler (`rawMsg.fields.routingKey`).

## Aturan

| Aturan | Detail |
|--------|--------|
| Satu `add()` = satu route | Wildcard `*` / `#` didukung |
| Multi-route per queue | Multiple `add()` → satu AMQP consumer, dispatch by routing key |
| Export default | Wajib di `*.consumer.ts` |
| Naming | Folder & file `kebab-case`; suffix `.consumer.ts`, `.handler.ts`, `.request.ts` |
| Handler tipis | `*.consumer.ts` hanya parse payload + panggil `process*` |
| Error | Throw di handler/consumer — jangan catch tanpa re-throw (retry/DLQ broker) |
| Try-catch | **Bukan** di handler consumer (lihat boilerplate) |
| Connection | Satu singleton `rabbitConnection` — jangan `new KnittoRabbitMQ()` per file |

## Retry & DLQ

1. Quorum queue + `x-delivery-limit = maxRetry + 1`
2. Handler error → `nack(requeue=true)` → broker retry
3. Limit habis → DLQ `{queue}.dlq` via `{exchangeName}.dlq`
4. Invalid JSON → langsung DLQ
