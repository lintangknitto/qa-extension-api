# Contoh skill `knitto-rabbitmq-consumer`

File di folder ini berisi **ilustrasi generik** (domain fiktif `widget-acme`) selaras dengan `boilerplate.mdc` (Valibot, throw error, alias `@/`).

| File | Isi |
|------|-----|
| `request.snippet.md` | Skema Valibot payload message + tipe |
| `handler.snippet.md` | `process*` — orkestrasi DB tanpa try-catch |
| `consumer.snippet.md` | `createConsumer` + `consumer.add`, export default |
| `bootstrap.snippet.md` | `subscribe()` + glob pattern |
| `publisher.snippet.md` | `publishMessage` dari publisher function |
| `multi-route.snippet.md` | Banyak route pada satu queue |

Ganti placeholder (`<queue-name>`, routing key, path) sesuai proyek.
