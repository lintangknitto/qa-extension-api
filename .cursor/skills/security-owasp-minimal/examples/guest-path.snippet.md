# Guest path — menambah dengan aman

Guest path hanya untuk endpoint yang **memang** publik tanpa JWT. Daftar tunggal: [`src/libs/config/guestPathHttp.ts`](../../../../src/libs/config/guestPathHttp.ts).

## Konfigurasi

```typescript
interface IGuestPathCfg {
	path: string
	withSubPath?: boolean
	method: Array<'get' | 'post' | 'put' | 'delete' | 'patch'>
}
```

| Field | Risiko |
| ----- | ------ |
| `path` | Harus spesifik (`/auth/login`), bukan prefix luas tanpa alasan |
| `withSubPath: true` | **Semua** subpath method terpilih bypass JWT — blocker jika membuka area admin |
| `method: []` | Semua method di path (dan subpath jika `withSubPath`) |

## Contoh aman — login publik

```typescript
{
	path: '/auth/login',
	method: ['post']
}
```

Hanya `POST /auth/login` — tidak membuka `GET /auth/login` atau route lain.

## Contoh hati-hati — dokumentasi

```typescript
{
	path: '/api-docs',
	withSubPath: true,
	method: []
}
```

OK untuk static docs; **jangan** pola ini untuk domain bisnis (`/api/v1` + `withSubPath: true` = auth bypass masal).

## Checklist sebelum commit

- [ ] Endpoint sensitif (mutasi data, PII, admin) **tidak** tercakup guest
- [ ] `withSubPath` dijustifikasi di PR/plan bila dipakai
- [ ] OpenAPI mencatat `security: []` atau bearer sesuai kontrak

Playbook: [`../SKILL.md`](../SKILL.md)
