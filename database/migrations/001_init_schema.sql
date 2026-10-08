-- Fresh PostgreSQL schema for the Knitto QA Tools application.
-- Apply only to a new/empty database. This baseline intentionally contains no DROP or seed data.
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Table users (Application users & QA testers)
CREATE TABLE IF NOT EXISTS users (
    id_user BIGSERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    nama VARCHAR(150) NOT NULL,
    level VARCHAR(50) NOT NULL DEFAULT 'QA',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_level ON users (level);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);

-- 2. Table programs (Master Program / Application catalog)
CREATE TABLE IF NOT EXISTS programs (
    id_program BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(60) UNIQUE NOT NULL,
    type VARCHAR(30) NOT NULL DEFAULT 'FRONTEND',
    grafana_dashboard_url VARCHAR(500),
    description TEXT,
    base_url VARCHAR(500),
    repo_url VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_user_id BIGINT REFERENCES users(id_user) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_programs_code ON programs (code);
CREATE INDEX IF NOT EXISTS idx_programs_is_active ON programs (is_active);
CREATE INDEX IF NOT EXISTS idx_programs_created_by ON programs (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_programs_type ON programs (type);

-- 3. Table projects (Test Projects belonging to a Program)
CREATE TABLE IF NOT EXISTS projects (
    id_project BIGSERIAL PRIMARY KEY,
    id_program BIGINT REFERENCES programs(id_program) ON DELETE SET NULL,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(60) UNIQUE NOT NULL,
    description TEXT,
    base_url VARCHAR(500),
    repo_url VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_user_id BIGINT REFERENCES users(id_user) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_program ON projects (id_program);
CREATE INDEX IF NOT EXISTS idx_projects_code ON projects (code);
CREATE INDEX IF NOT EXISTS idx_projects_is_active ON projects (is_active);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects (created_by_user_id);

CREATE TABLE IF NOT EXISTS project_programs (
    id_project BIGINT NOT NULL REFERENCES projects(id_project) ON DELETE CASCADE,
    id_program BIGINT NOT NULL REFERENCES programs(id_program) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_project, id_program)
);

CREATE INDEX IF NOT EXISTS idx_project_programs_program ON project_programs (id_program);

-- 4. Table user_projects
CREATE TABLE IF NOT EXISTS user_projects (
    id_user_project BIGSERIAL PRIMARY KEY,
    id_user BIGINT NOT NULL REFERENCES users(id_user) ON DELETE CASCADE,
    id_project BIGINT NOT NULL REFERENCES projects(id_project) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_projects_user_project UNIQUE (id_user, id_project)
);

CREATE INDEX IF NOT EXISTS idx_user_projects_user ON user_projects (id_user);
CREATE INDEX IF NOT EXISTS idx_user_projects_project ON user_projects (id_project);

-- 5. Table test_cases
CREATE TABLE IF NOT EXISTS test_cases (
    id_test_case BIGSERIAL PRIMARY KEY,
    id_project BIGINT NOT NULL REFERENCES projects(id_project) ON DELETE CASCADE,
    id_program BIGINT REFERENCES programs(id_program) ON DELETE SET NULL,
    group_no VARCHAR(50),
    feature VARCHAR(150),
    process_no VARCHAR(50),
    test_type VARCHAR(10) NOT NULL DEFAULT '+',
    test_case_id VARCHAR(80) NOT NULL,
    test_variable VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    pre_condition TEXT,
    test_data TEXT,
    test_steps TEXT,
    expected_result TEXT,
    actual_result TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'Progress',
    evidence TEXT,
    remarks TEXT,
    automation_tools VARCHAR(100),
    last_session_id BIGINT,
    created_by_user_id BIGINT REFERENCES users(id_user) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_test_cases_project_code UNIQUE (id_project, test_case_id)
);

CREATE INDEX IF NOT EXISTS idx_test_cases_project ON test_cases (id_project);
CREATE INDEX IF NOT EXISTS idx_test_cases_program ON test_cases (id_program);
CREATE INDEX IF NOT EXISTS idx_test_cases_status ON test_cases (status);
CREATE INDEX IF NOT EXISTS idx_test_cases_feature ON test_cases (feature);
CREATE INDEX IF NOT EXISTS idx_test_cases_created_by ON test_cases (created_by_user_id);

-- 6. Table recording_sessions
CREATE TABLE IF NOT EXISTS recording_sessions (
    id_session BIGSERIAL PRIMARY KEY,
    id_project BIGINT REFERENCES projects(id_project) ON DELETE SET NULL,
    id_test_case BIGINT REFERENCES test_cases(id_test_case) ON DELETE SET NULL,
    owner_user_id BIGINT REFERENCES users(id_user) ON DELETE SET NULL,
    test_case_no VARCHAR(80),
    title VARCHAR(255),
    description TEXT,
    target_url VARCHAR(500),
    status VARCHAR(50) NOT NULL DEFAULT 'recording',
    result VARCHAR(20),
    actual_result TEXT,
    share_token VARCHAR(100),
    video_url TEXT,
    record_video BOOLEAN DEFAULT TRUE,
    last_sequence BIGINT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recording_sessions_project ON recording_sessions (id_project);
CREATE INDEX IF NOT EXISTS idx_recording_sessions_test_case ON recording_sessions (id_test_case);
CREATE INDEX IF NOT EXISTS idx_recording_sessions_owner ON recording_sessions (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_recording_sessions_status ON recording_sessions (status);
CREATE INDEX IF NOT EXISTS idx_recording_sessions_share_token ON recording_sessions (share_token);

-- 7. Table recording_checkpoints
CREATE TABLE IF NOT EXISTS recording_checkpoints (
    id_checkpoint BIGSERIAL PRIMARY KEY,
    id_session BIGINT NOT NULL REFERENCES recording_sessions(id_session) ON DELETE CASCADE,
    note TEXT NOT NULL,
    sequence BIGINT,
    id_artifact BIGINT,
    created_by_user_id BIGINT REFERENCES users(id_user) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recording_checkpoints_session ON recording_checkpoints (id_session);

-- 8. Table recording_events
CREATE TABLE IF NOT EXISTS recording_events (
    id_event BIGSERIAL PRIMARY KEY,
    id_session BIGINT NOT NULL REFERENCES recording_sessions(id_session) ON DELETE CASCADE,
    sequence BIGINT NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    tab_id INT,
    url TEXT,
    payload JSONB NOT NULL DEFAULT '{}',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_recording_events_session_sequence UNIQUE (id_session, sequence)
);

CREATE INDEX IF NOT EXISTS idx_recording_events_session ON recording_events (id_session);
CREATE INDEX IF NOT EXISTS idx_recording_events_type ON recording_events (event_type);
CREATE INDEX IF NOT EXISTS idx_recording_events_payload_gin ON recording_events USING gin (payload);

-- 9. Table recording_artifacts
CREATE TABLE IF NOT EXISTS recording_artifacts (
    id_artifact BIGSERIAL PRIMARY KEY,
    id_session BIGINT NOT NULL REFERENCES recording_sessions(id_session) ON DELETE CASCADE,
    kind VARCHAR(50) NOT NULL,
    object_key TEXT NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    sequence BIGINT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    checksum_sha256 VARCHAR(64),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recording_artifacts_session ON recording_artifacts (id_session);
CREATE INDEX IF NOT EXISTS idx_recording_artifacts_kind ON recording_artifacts (kind);
CREATE INDEX IF NOT EXISTS idx_recording_artifacts_object_key ON recording_artifacts (object_key);

-- 10. Table recording_generations
CREATE TABLE IF NOT EXISTS recording_generations (
    id_generation BIGSERIAL PRIMARY KEY,
    id_session BIGINT NOT NULL REFERENCES recording_sessions(id_session) ON DELETE CASCADE,
    kind VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    model VARCHAR(100),
    prompt_version VARCHAR(50),
    attempt_count INT NOT NULL DEFAULT 1,
    output TEXT,
    error_message TEXT,
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_recording_generations_session_kind UNIQUE (id_session, kind)
);

CREATE INDEX IF NOT EXISTS idx_recording_generations_session ON recording_generations (id_session);
CREATE INDEX IF NOT EXISTS idx_recording_generations_kind ON recording_generations (kind);

-- 11. Table codebase_files
CREATE TABLE IF NOT EXISTS codebase_files (
    id_file BIGSERIAL PRIMARY KEY,
    id_project BIGINT NOT NULL REFERENCES projects(id_project) ON DELETE CASCADE,
    file_path VARCHAR(500) NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    language VARCHAR(50) NOT NULL DEFAULT 'typescript',
    total_lines INT NOT NULL DEFAULT 0,
    ast_summary JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_codebase_files_project_path UNIQUE (id_project, file_path)
);

CREATE INDEX IF NOT EXISTS idx_codebase_files_project ON codebase_files (id_project);

-- 12. Table codebase_symbols
CREATE TABLE IF NOT EXISTS codebase_symbols (
    id_symbol BIGSERIAL PRIMARY KEY,
    id_file BIGINT NOT NULL REFERENCES codebase_files(id_file) ON DELETE CASCADE,
    id_project BIGINT NOT NULL REFERENCES projects(id_project) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    kind VARCHAR(50) NOT NULL,
    signature TEXT,
    docstring TEXT,
    start_line INT NOT NULL,
    end_line INT NOT NULL,
    scope_path VARCHAR(255),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_codebase_symbols_project ON codebase_symbols (id_project);
CREATE INDEX IF NOT EXISTS idx_codebase_symbols_file ON codebase_symbols (id_file);
CREATE INDEX IF NOT EXISTS idx_codebase_symbols_name ON codebase_symbols (name);
CREATE INDEX IF NOT EXISTS idx_codebase_symbols_kind ON codebase_symbols (kind);

-- 13. Table codebase_chunks
CREATE TABLE IF NOT EXISTS codebase_chunks (
    id_chunk BIGSERIAL PRIMARY KEY,
    id_file BIGINT NOT NULL REFERENCES codebase_files(id_file) ON DELETE CASCADE,
    id_project BIGINT NOT NULL REFERENCES projects(id_project) ON DELETE CASCADE,
    chunk_type VARCHAR(50) NOT NULL DEFAULT 'symbol',
    content TEXT NOT NULL,
    start_line INT NOT NULL,
    end_line INT NOT NULL,
    embedding vector(1536) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_codebase_chunks_project ON codebase_chunks (id_project);
CREATE INDEX IF NOT EXISTS idx_codebase_chunks_file ON codebase_chunks (id_file);
CREATE INDEX IF NOT EXISTS idx_codebase_chunks_embedding_hnsw ON codebase_chunks USING hnsw (embedding vector_cosine_ops);
