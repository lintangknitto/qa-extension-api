# Migration Product Backlog — template

Simpan di `database/PB-x.x.x.sql` (ganti `x.x.x` dengan versi epic PB).

```sql
-- PB-x.x.x — {judul singkat epic/fitur}
-- Ticket / docs: docs/pb/{PB}/{task}/...
-- Diterapkan manual ke dev/staging sebelum merge fitur terkait.

-- Contoh: tabel baru
CREATE TABLE IF NOT EXISTS widgets_acme (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	sku VARCHAR(64) NOT NULL,
	qty INT NOT NULL DEFAULT 0,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uk_widgets_acme_sku (sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Contoh: kolom tambahan (sesuaikan; hindari CTE / ROW_NUMBER())
-- ALTER TABLE widgets_acme ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'active' AFTER qty;
```
