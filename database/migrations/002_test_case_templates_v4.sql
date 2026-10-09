-- Format Test Case V4: template registry, scenario/date on test cases, V4 header metadata on projects.

-- 1. Registry template spreadsheet test case (global, dikelola ADMIN/SUPERADMIN)
CREATE TABLE IF NOT EXISTS test_case_templates (
    id_template BIGSERIAL PRIMARY KEY,
    version_label VARCHAR(30) NOT NULL,
    name VARCHAR(150) NOT NULL,
    spreadsheet_url VARCHAR(500) NOT NULL,
    gid VARCHAR(30),
    -- { "<field sistem>": { "header": "<header kolom>", "aliases": ["..."] } }
    column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- { "metadata": { "<field>": "<sel>" }, "header_row": n, "data_start_row": n, "pb_block": { ... } }
    export_anchors JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_user_id BIGINT REFERENCES users(id_user) ON DELETE SET NULL,
    updated_by_user_id BIGINT REFERENCES users(id_user) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_test_case_templates_version UNIQUE (version_label)
);

-- Hanya satu template default.
CREATE UNIQUE INDEX IF NOT EXISTS uq_test_case_templates_default
    ON test_case_templates (is_default) WHERE is_default;
CREATE INDEX IF NOT EXISTS idx_test_case_templates_is_active ON test_case_templates (is_active);

-- 2. Kolom V4 di test_cases
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS scenario TEXT;
-- Disimpan apa adanya dari sheet (format tanggal tester tidak seragam).
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS test_date VARCHAR(50);

-- 3. Metadata header V4 di projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS release_version VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS test_app_folder VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ip_dev VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ip_prod VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tester_name VARCHAR(150);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS programmer_name VARCHAR(150);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS task_dev VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS brd_id VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS link_task_pb VARCHAR(500);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS link_figma VARCHAR(500);

-- 4. Seed template V4 sebagai default (idempoten: tidak menimpa perubahan admin)
INSERT INTO test_case_templates (version_label, name, spreadsheet_url, gid, column_mapping, export_anchors, is_default, is_active)
SELECT
    'V4',
    'FORMAT TEST CASE V4',
    'https://docs.google.com/spreadsheets/d/1k_08EdNZUBGBhLNU-FIPxqm06PpCfn4Dyprc4sDYCsI/edit?gid=1730053292',
    '1730053292',
    '{
        "group_no":         {"header": "Group No",         "aliases": ["group", "no group", "grup"]},
        "feature":          {"header": "Feature",          "aliases": ["fitur", "fitur/modul"]},
        "process_no":       {"header": "Process No (FC)",  "aliases": ["process no", "fc", "process"]},
        "test_type":        {"header": "TYPE",             "aliases": ["test type", "tipe"]},
        "test_case_id":     {"header": "Test Case ID",     "aliases": ["tc id", "id test case", "test case no"]},
        "test_variable":    {"header": "Test Variable",    "aliases": ["variable", "variabel"]},
        "scenario":         {"header": "Scenario",         "aliases": ["skenario"]},
        "title":            {"header": "Test Case",        "aliases": ["judul", "title", "nama test case"]},
        "pre_condition":    {"header": "Pre-Condition",    "aliases": ["precondition", "pre condition", "prasyarat"]},
        "test_data":        {"header": "Test Data",        "aliases": ["data test", "data uji"]},
        "test_steps":       {"header": "Test Steps",       "aliases": ["steps", "langkah", "langkah pengujian"]},
        "expected_result":  {"header": "Expected Result",  "aliases": ["expected", "hasil yang diharapkan"]},
        "status":           {"header": "Status",           "aliases": []},
        "evidence":         {"header": "Evidence",         "aliases": ["bukti"]},
        "remarks":          {"header": "Remarks",          "aliases": ["catatan", "keterangan", "notes"]},
        "automation_tools": {"header": "Automation Tools", "aliases": ["automation", "automation tool"]},
        "test_date":        {"header": "Date",             "aliases": ["tanggal", "test date"]}
    }'::jsonb,
    '{
        "sheet_name": "FORMAT TEST CASE V4",
        "metadata": {
            "release_version": "B1",
            "test_app_folder": "B2",
            "ip_dev": "B3",
            "ip_prod": "B4",
            "tester_name": "F1",
            "programmer_name": "F2",
            "task_dev": "F3",
            "created_at": "J1",
            "updated_at": "J2"
        },
        "header_row": 18,
        "data_start_row": 19,
        "pb_block": {
            "title_cell": "A12",
            "spec_start_row": 13,
            "spec_end_row": 16,
            "spec_no_column": "B",
            "spec_text_column": "C",
            "checkbox_column": "K",
            "test_case_id_column": "L",
            "brd_id_cell": "A17",
            "link_task_cell": "B17",
            "link_figma_cell": "R17"
        }
    }'::jsonb,
    TRUE,
    TRUE
WHERE NOT EXISTS (SELECT 1 FROM test_case_templates WHERE version_label = 'V4');
