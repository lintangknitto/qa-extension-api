# Kontrak Test Session Recorder

Dokumen kontrak untuk fitur test session recorder. Melengkapi `openapi.yaml`;
semua endpoint di bawah memakai prefix yang sama dengan router HTTP biasa
(tanpa prefix tambahan) dan memerlukan header `Authorization: Bearer <JWT>`
kecuali dinyatakan guest.

## Authorization

| Peran | Aturan |
|-------|--------|
| Tester (login) | Membuat/mengakhiri session miliknya, mengirim event, checkpoint, upload artifact, melihat session miliknya |
| QA/admin (`PROJECT_ADMIN_LEVELS`) | Semua endpoint tester + CRUD master project + melihat semua session |

Endpoint tanpa login hanya `POST /auth/login`. Socket.IO memakai token yang sama.

## REST endpoints

### Master project

| Method | Path | Akses | Keterangan |
|--------|------|-------|-----------|
| POST | `/projects` | QA/admin | Buat project |
| GET | `/projects` | QA/admin | Daftar project + filter `search`, `is_active`, paginasi |
| GET | `/projects/active` | Tester | Daftar project aktif (untuk selector) |
| GET | `/projects/:id_project` | Tester (non-aktif hanya QA/admin) | Detail project |
| PUT | `/projects/:id_project` | QA/admin | Ubah project |
| DELETE | `/projects/:id_project` | QA/admin | Nonaktifkan project (soft delete) |

Body create/update: `name` (wajib, 3-150), `code` (opsional, `^[a-z0-9]+(-[a-z0-9]+)*$`),
`description` (opsional), `base_url` (opsional), `is_active` (opsional, boolean).
Query list: `page`, `perPage`, `search`, `is_active` (`all|true|false`).

Respons sukses: `{ status, message, result }` dengan `result.items` dan
`result.pagination { page, perPage, total }` untuk list.

### Recording session

| Method | Path | Akses | Keterangan |
|--------|------|-------|-----------|
| POST | `/sessions` | Tester | Buat session recording |
| GET | `/sessions` | Tester (otomatis difilter ke miliknya) / QA-admin | List + filter `id_project`, `tester_user_id`, `status`, `result`, `date_from`, `date_to` |
| GET | `/sessions/:id_session` | Owner / QA-admin | Detail session + `checkpoints` |
| POST | `/sessions/:id_session/end` | Owner / QA-admin | Akhiri session |
| POST | `/sessions/:id_session/checkpoints` | Owner / QA-admin | Tambah checkpoint |

Body create: `id_project` (number), `test_case_no` (1-80), `title` (1-255),
`description` (opsional), `target_url` (opsional).
Body end: `result` (`PASS|FAIL|BLOCKED`), `actual_result` (opsional).
Body checkpoint: `note` (1-2000), `sequence` (opsional), `id_artifact` (opsional).

Catatan: satu user hanya boleh punya satu session berstatus `recording`
(dijaga pengecekan aplikasi + unique key `uq_qa_session_active_owner`).

### Artifact (MinIO standalone)

| Method | Path | Akses | Keterangan |
|--------|------|-------|-----------|
| POST | `/sessions/:id_session/artifacts/presign-upload` | Owner / QA-admin | Buat presigned PUT |
| POST | `/sessions/:id_session/artifacts/:id_artifact/complete` | Owner / QA-admin | Tandai artifact terunggah |
| GET | `/sessions/:id_session/artifacts/:id_artifact/download-url` | Owner / QA-admin | Presigned GET |

Body presign: `kind` (`screenshot|network_body|console|dom|other`),
`content_type` (harus ada di `RECORDING_ARTIFACT_CONTENT_TYPES`),
`size_bytes` (≤ `RECORDING_UPLOAD_MAX_BYTES`), `sequence` (opsional).

Respons presign: `{ artifact, upload_url, object_key, expires_in }`.
Extension mengunggah langsung ke `upload_url` (tanpa menerima credential MinIO),
lalu memanggil endpoint `complete`.

### AI generation

| Method | Path | Akses | Keterangan |
|--------|------|-------|-----------|
| POST | `/sessions/:id_session/generations` | Owner / QA-admin | Generate / retry |
| GET | `/sessions/:id_session/generations` | Owner / QA-admin | Daftar hasil generation |

Body opsional: `kinds: ["markdown", "playwright"]` (default keduanya).
Generate bersifat idempotent per `(id_session, kind)`: retry menaikkan
`attempt_count` pada baris yang sama dan tidak butuh recording ulang.
Session tetap berstatus selesai walau generation gagal (`status: failed`,
`error_message` terisi).

## Socket.IO

- Path: `/knitto-socket`
- Auth: `auth: { token }` pada handshake, atau header `Authorization: Bearer <token>`.
- Room: `recording:session:<id_session>` (join setelah akses diverifikasi).

### Client → server

| Event | Payload | Ack |
|-------|---------|-----|
| `recording:join` | `{ id_session }` | `{ ok, result: { session, resume: { last_sequence, next_sequence } } }` |
| `recording:events` | `{ id_session, events: RecordingEvent[] }` | `{ ok, result: { accepted, inserted, duplicates, last_sequence, resume } }` |

### RecordingEvent

```json
{
  "event_version": 1,
  "type": "action|tab|console|exception|network|artifact|checkpoint",
  "sequence": 1,
  "occurred_at": "2026-09-18T10:00:00.000Z",
  "tab_id": 123,
  "url": "https://contoh.test/checkout",
  "payload": {}
}
```

Aturan ingestion:
- `sequence` harus bilangan bulat ≥ 1 dan monotonik per session.
- Event dengan `sequence` ≤ `last_sequence` atau duplikat dalam satu batch dibuang.
- Pengiriman ulang setelah reconnect aman (idempotent) berkat unique key
  `(id_session, sequence)` dan `INSERT IGNORE`.

### Redaksi

Sebelum dipersist, backend meredaksi header `Authorization`/`Cookie`,
password, token/secret, field sensitif, email, deretan angka mirip kartu,
serta nilai query param sensitif. Body network hanya disimpan untuk tipe
teks/JSON dalam batas `RECORDING_NETWORK_BODY_MAX_BYTES`; binary/streaming
hanya menyimpan metadata dengan penanda `body_truncated`/`body_reason`.

## Error response

| Status | Kondisi |
|--------|---------|
| 400 | Validasi body/query/params gagal, atau aturan domain dilanggar |
| 401 | Token tidak ada/kedaluwarsa, sesi login berakhir |
| 403 | Bukan owner dan bukan QA/admin |
| 404 | Project/session/artifact tidak ditemukan |
| 429/500 | Bergantung pada error handler global `knitto-http` |

Bentuk umum: `{ status, message, result }`. Pesan error tidak boleh memuat
nilai secret.
