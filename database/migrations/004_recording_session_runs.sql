-- Riwayat run per sesi: Run #1 = rekaman asli, Run #2+ = re-run (replay). Video re-run tidak lagi menimpa video sesi.
CREATE TABLE IF NOT EXISTS recording_session_runs (
    id_run BIGSERIAL PRIMARY KEY,
    id_session BIGINT NOT NULL REFERENCES recording_sessions(id_session) ON DELETE CASCADE,
    run_number INTEGER NOT NULL,
    kind VARCHAR(20) NOT NULL DEFAULT 'rerun',
    result VARCHAR(20),
    actual_result TEXT,
    executed_steps INTEGER,
    error TEXT,
    video_object_key VARCHAR(500),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_by_user_id BIGINT REFERENCES users(id_user) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_recording_session_runs_number UNIQUE (id_session, run_number),
    CONSTRAINT ck_recording_session_runs_kind CHECK (kind IN ('original', 'rerun'))
);

-- Nama file asli test data (kind `test_data_file`) agar re-run memasang file dengan nama yang sama.
ALTER TABLE recording_artifacts ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);

-- Backfill Run #1 dari sesi yang sudah selesai.
INSERT INTO recording_session_runs
    (id_session, run_number, kind, result, actual_result, video_object_key, started_at, ended_at, created_by_user_id, created_at)
SELECT id_session, 1, 'original', result, actual_result, video_object_key, started_at, ended_at, owner_user_id, COALESCE(ended_at, created_at)
FROM recording_sessions
WHERE status <> 'recording'
ON CONFLICT (id_session, run_number) DO NOTHING;
