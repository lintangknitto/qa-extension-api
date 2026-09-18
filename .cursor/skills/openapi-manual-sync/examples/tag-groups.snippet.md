# Snippet: tag modul + x-tagGroups (Scalar sidebar)

Modul baru di `src/app/http/pembelian/` → tag `pembelian`, grup sidebar sesuai domain bisnis.

## Tambah di root spec (sebelum `paths:`)

```yaml
tags:
  - name: home
    description: Modul umum (`src/app/http/home`).
  - name: auth
    description: Autentikasi (`src/app/http/auth`).
  - name: pembelian
    description: Modul pembelian (`src/app/http/pembelian`).

x-tagGroups:
  - name: Umum
    tags:
      - home
  - name: Autentikasi
    tags:
      - auth
  - name: Pembelian
    tags:
      - pembelian
```

## Di setiap operasi modul

```yaml
      tags:
        - pembelian
```

**Aturan:** nama tag = **kebab-case** folder langsung di bawah `src/app/http/` (bukan nested subfolder kecuali tim sepakat tag terpisah). Satu tag utama per operasi.
