# Snippet: operasi GET / POST

Selaras [`docs/openapi/openapi.yaml`](../../../../docs/openapi/openapi.yaml). Satu tag = folder modul di `src/app/http/{modul}`.

## GET (read, tanpa body)

```yaml
  /contoh/resource:
    get:
      tags:
        - contoh
      summary: Ambil resource
      description: Deskripsi singkat selaras controller.
      operationId: getContohResource
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Sukses
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/KnittoSuccessEnvelope'
              example:
                message: Success
                result: {}
        '401':
          description: Tidak terautentikasi
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/KnittoErrorEnvelope'
              example:
                message: Unauthorized
                result: {}
```

## POST (body JSON)

```yaml
  /contoh/resource:
    post:
      tags:
        - contoh
      summary: Buat resource
      operationId: postContohResource
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ContohCreateRequest'
            example:
              nama: contoh
      responses:
        '200':
          description: Sukses
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/KnittoSuccessEnvelope'
                  - type: object
                    properties:
                      result:
                        $ref: '#/components/schemas/ContohCreateResult'
              example:
                message: Success
                result:
                  id: 1
        '400':
          description: Validasi gagal
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/KnittoErrorEnvelope'
              example:
                message: Field wajib tidak valid
                result: {}
```

**Catatan:** `operationId` unik; guest route tanpa `security` (sesuai `guestPathHttp`).
