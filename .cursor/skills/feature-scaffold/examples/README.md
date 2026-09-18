# Contoh skill `feature-scaffold`

File di folder ini berisi **ilustrasi generik** (modul fiktif `widget-acme`) selaras `boilerplate.mdc` (ctx style, `queries/`, `repo/`) dan README `@knittotextile/knitto-http`.

| File | Isi |
|------|-----|
| `routes.snippet.md` | `Router()` + `requestValidator` + `requestHandler` |
| `request.snippet.md` | Skema Valibot + tipe |
| `controller.snippet.md` | Simple read, complex write, transaksi multi-repo |
| `query.snippet.md` | SELECT di `queries/*.queries.ts` |
| `case.snippet.md` | ctx style `{ req, ... }` |
| `domain.snippet.md` | Aturan bisnis murni |
| `repository.snippet.md` | `repo/*.repo.ts` + BaseRepository |
| `tests.snippet.md` | Unit test domain + helper |
| `express-raw-handler.snippet.md` | File/streaming: `Router()` + handler `(req, res)` tanpa `requestHandler` |

Ganti placeholder path (`@/...`, nama paket) sesuai proyek.
