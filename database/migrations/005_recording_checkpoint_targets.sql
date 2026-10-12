-- Checkpoint ber-target: elemen yang dipilih tester ("Pilih elemen") dan URL halaman saat checkpoint dibuat.
-- Codegen mengubahnya menjadi assertion (toContainText/toBeVisible/toHaveURL). Checkpoint lama tetap valid (semua NULL).
ALTER TABLE recording_checkpoints ADD COLUMN IF NOT EXISTS target_locators JSONB;
ALTER TABLE recording_checkpoints ADD COLUMN IF NOT EXISTS target_text VARCHAR(200);
ALTER TABLE recording_checkpoints ADD COLUMN IF NOT EXISTS page_url TEXT;
ALTER TABLE recording_checkpoints ADD COLUMN IF NOT EXISTS tab_id INT;
