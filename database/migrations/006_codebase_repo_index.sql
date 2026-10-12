-- Index codebase memory per repo+branch (bukan per project): project yang menautkan program dengan repo
-- yang sama berbagi satu index. Status sync disimpan per repo untuk auto-index (pemicu buat/ubah program/
-- project, job berkala berbasis SHA commit terakhir, dan Investigasi).
CREATE TABLE IF NOT EXISTS codebase_repos (
    id_repo BIGSERIAL PRIMARY KEY,
    repo_key VARCHAR(255) NOT NULL,
    repo_url VARCHAR(500) NOT NULL,
    branch VARCHAR(255) NOT NULL,
    -- TRUE = baris ini mewakili "default branch repo" (program tanpa repo_branch). Branch kosong = default
    -- branch belum bisa di-resolve (mis. token GitHub tidak valid); diisi saat resolve berhasil.
    tracks_default BOOLEAN NOT NULL DEFAULT FALSE,
    last_indexed_sha VARCHAR(64),
    status VARCHAR(20) NOT NULL DEFAULT 'idle',
    last_error TEXT,
    sync_started_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_codebase_repos_key_branch UNIQUE (repo_key, branch),
    CONSTRAINT ck_codebase_repos_status CHECK (status IN ('idle', 'syncing', 'failed'))
);

-- Branch repo program (kosong = default branch repo di GitHub).
ALTER TABLE programs ADD COLUMN IF NOT EXISTS repo_branch VARCHAR(255);

-- Index lama per project tidak bisa dipetakan ke repo: dikosongkan lalu dibangun ulang oleh auto-index.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_name = 'codebase_files' AND column_name = 'id_project'
    ) THEN
        DELETE FROM codebase_chunks;
        DELETE FROM codebase_symbols;
        DELETE FROM codebase_files;

        ALTER TABLE codebase_chunks DROP COLUMN id_project;
        ALTER TABLE codebase_symbols DROP COLUMN id_project;
        ALTER TABLE codebase_files DROP CONSTRAINT IF EXISTS uq_codebase_files_project_path;
        ALTER TABLE codebase_files DROP COLUMN id_project;

        ALTER TABLE codebase_files ADD COLUMN id_repo BIGINT NOT NULL REFERENCES codebase_repos(id_repo) ON DELETE CASCADE;
        ALTER TABLE codebase_files ADD CONSTRAINT uq_codebase_files_repo_path UNIQUE (id_repo, file_path);
        ALTER TABLE codebase_symbols ADD COLUMN id_repo BIGINT NOT NULL REFERENCES codebase_repos(id_repo) ON DELETE CASCADE;
        ALTER TABLE codebase_chunks ADD COLUMN id_repo BIGINT NOT NULL REFERENCES codebase_repos(id_repo) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_codebase_files_repo ON codebase_files (id_repo);
CREATE INDEX IF NOT EXISTS idx_codebase_symbols_repo ON codebase_symbols (id_repo);
CREATE INDEX IF NOT EXISTS idx_codebase_chunks_repo ON codebase_chunks (id_repo);

-- Paling banyak satu baris "default branch" per repo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_codebase_repos_default ON codebase_repos (repo_key) WHERE tracks_default;

-- SHA blob git file terakhir yang di-index: file dengan blob sama tidak diunduh ulang dari GitHub saat sync.
ALTER TABLE codebase_files ADD COLUMN IF NOT EXISTS git_blob_sha VARCHAR(64);
