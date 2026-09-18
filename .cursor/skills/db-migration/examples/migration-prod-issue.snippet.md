# Migration production issue — template

Simpan di `database/YYYYMMDDHHmmss.sql` (timestamp saat file dibuat, timezone tim).

```sql
-- Production issue — {deskripsi singkat}
-- Dibuat: YYYY-MM-DD
-- Jangan campur dengan file PB-x.x.x.sql

-- Contoh: index untuk hotfix performa
-- CREATE INDEX idx_widgets_acme_status ON widgets_acme (status);

-- Contoh: kolom nullable untuk backward compatibility sementara
-- ALTER TABLE widgets_acme ADD COLUMN legacy_code VARCHAR(32) NULL COMMENT 'hotfix prod #...';
```

Apply manual; dokumentasikan di PR/issue. Jangan ubah migration PB yang sudah production.
