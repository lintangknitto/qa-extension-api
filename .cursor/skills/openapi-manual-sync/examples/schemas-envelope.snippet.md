# Snippet: envelope + request/result (components/schemas)

Reuse pola existing di [`docs/openapi/openapi.yaml`](../../../../docs/openapi/openapi.yaml).

## Envelope (jangan duplikasi — sudah ada)

- **`KnittoSuccessEnvelope`** — `message` + `result` (object, nullable di schema)
- **`KnittoErrorEnvelope`** — sama bentuk; pesan error di `message`

Response 200 dengan `result` tiped:

```yaml
schema:
  allOf:
    - $ref: '#/components/schemas/KnittoSuccessEnvelope'
    - type: object
      properties:
        result:
          $ref: '#/components/schemas/LoginResult'
```

## Request body (selaras Valibot)

Contoh existing `LoginRequest`:

```yaml
    LoginRequest:
      type: object
      required:
        - username
        - password
      properties:
        username:
          type: string
          description: Nama pengguna
        password:
          type: string
          format: password
          description: Kata sandi
```

Tambah skema baru di `components/schemas`:

```yaml
    ContohCreateRequest:
      type: object
      required:
        - nama
      properties:
        nama:
          type: string
```

## Result nested

```yaml
    ContohCreateResult:
      type: object
      properties:
        id:
          type: integer
        nama:
          type: string
```

**Example JSON:** untuk error/sukses generik, `result: {}` — bukan `result: null` di contoh dokumentasi.
