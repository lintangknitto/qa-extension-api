# Checklist keamanan — endpoint baru

Gunakan saat scaffold fitur atau audit modul. Playbook: [`../SKILL.md`](../SKILL.md).

## Identitas endpoint

- **Path & method:** `___`
- **Auth:** JWT required / guest (daftar di `guestPathHttp.ts`) / role khusus
- **Mutasi:** ya / tidak — idempotency perlu? ___

## Checklist OWASP (implementasi)

- [ ] **API2** Route tidak bypass auth kecuali terdaftar guest dengan method/path tepat
- [ ] **API1/API5** User A tidak bisa akses resource user B (cek id di path/body)
- [ ] **API4** List pakai pagination; body/query dibatasi Valibot (`*.request.ts`)
- [ ] **API3** `result` hanya field yang boleh ke client (tanpa hash internal, flag admin mentah, dll.)
- [ ] SQL hanya parameterized — lihat [`sql-parameterized.snippet.md`](./sql-parameterized.snippet.md)
- [ ] **API7** Tidak ada fetch URL dari user tanpa allowlist di `service/*.service.ts`
- [ ] **API8** Tidak hardcode secret; env untuk kunci
- [ ] **API9** Jika kontrak dipublish: `openapi.yaml` + guest path konsisten
- [ ] **API10** Response API eksternal divalidasi sebelum dipakai business logic
- [ ] Log tidak mencetak Authorization header / password

## Setelah implement

- `pnpm build` + `pnpm test` (scope modul)
- Opsional audit diff dengan `/security` sebelum PR
