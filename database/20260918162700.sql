-- 20260918162700 — Test session recorder (project, session, event, checkpoint, artifact, generation)
-- Docs: qa-chrome-extension/docs/prd/todo/test-session-recorder/
-- Diterapkan manual ke dev/staging sebelum merge fitur terkait.
-- Catatan: MinIO adalah service standalone; tabel artifact hanya menyimpan metadata object key.
-- Hindari CTE / ROW_NUMBER() sesuai konvensi proyek.

CREATE TABLE IF NOT EXISTS `qa_project` (
	`id_project` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	`name` VARCHAR(150) NOT NULL,
	`code` VARCHAR(60) NOT NULL,
	`description` TEXT NULL,
	`base_url` VARCHAR(500) NULL,
	`is_active` TINYINT(1) NOT NULL DEFAULT 1,
	`created_by_user_id` BIGINT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (`id_project`),
	UNIQUE KEY `uq_qa_project_code` (`code`),
	KEY `idx_qa_project_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qa_recording_session` (
	`id_session` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	`id_project` BIGINT UNSIGNED NOT NULL,
	`test_case_no` VARCHAR(80) NOT NULL,
	`title` VARCHAR(255) NOT NULL,
	`description` TEXT NULL,
	`target_url` VARCHAR(1000) NULL,
	`owner_user_id` BIGINT NOT NULL,
	`status` VARCHAR(20) NOT NULL DEFAULT 'recording',
	`result` VARCHAR(10) NULL,
	`actual_result` TEXT NULL,
	`last_sequence` BIGINT NOT NULL DEFAULT 0,
	`started_at` DATETIME NULL,
	`ended_at` DATETIME NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	-- Kolom generated untuk menjamin hanya ada satu session 'recording' aktif per user.
	`active_owner_key` BIGINT GENERATED ALWAYS AS (CASE WHEN `status` = 'recording' THEN `owner_user_id` ELSE NULL END) STORED,
	PRIMARY KEY (`id_session`),
	UNIQUE KEY `uq_qa_session_active_owner` (`active_owner_key`),
	KEY `idx_qa_session_project` (`id_project`, `created_at`),
	KEY `idx_qa_session_owner` (`owner_user_id`, `created_at`),
	KEY `idx_qa_session_status` (`status`),
	CONSTRAINT `fk_qa_session_project` FOREIGN KEY (`id_project`) REFERENCES `qa_project` (`id_project`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qa_recording_event` (
	`id_event` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	`id_session` BIGINT UNSIGNED NOT NULL,
	`sequence` BIGINT NOT NULL,
	`event_type` VARCHAR(40) NOT NULL,
	`tab_id` BIGINT NULL,
	`url` VARCHAR(2000) NULL,
	`payload` MEDIUMTEXT NULL,
	`occurred_at` DATETIME(3) NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`id_event`),
	UNIQUE KEY `uq_qa_event_session_sequence` (`id_session`, `sequence`),
	KEY `idx_qa_event_session_type` (`id_session`, `event_type`),
	CONSTRAINT `fk_qa_event_session` FOREIGN KEY (`id_session`) REFERENCES `qa_recording_session` (`id_session`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qa_recording_artifact` (
	`id_artifact` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	`id_session` BIGINT UNSIGNED NOT NULL,
	`kind` VARCHAR(30) NOT NULL,
	`object_key` VARCHAR(700) NOT NULL,
	`content_type` VARCHAR(150) NOT NULL,
	`size_bytes` BIGINT NOT NULL DEFAULT 0,
	`sequence` BIGINT NULL,
	`checksum_sha256` VARCHAR(64) NULL,
	`status` VARCHAR(20) NOT NULL DEFAULT 'pending',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (`id_artifact`),
	UNIQUE KEY `uq_qa_artifact_object_key` (`object_key`),
	KEY `idx_qa_artifact_session` (`id_session`, `kind`),
	CONSTRAINT `fk_qa_artifact_session` FOREIGN KEY (`id_session`) REFERENCES `qa_recording_session` (`id_session`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qa_recording_checkpoint` (
	`id_checkpoint` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	`id_session` BIGINT UNSIGNED NOT NULL,
	`note` TEXT NOT NULL,
	`sequence` BIGINT NULL,
	`id_artifact` BIGINT UNSIGNED NULL,
	`created_by_user_id` BIGINT NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`id_checkpoint`),
	KEY `idx_qa_checkpoint_session` (`id_session`, `created_at`),
	CONSTRAINT `fk_qa_checkpoint_session` FOREIGN KEY (`id_session`) REFERENCES `qa_recording_session` (`id_session`),
	CONSTRAINT `fk_qa_checkpoint_artifact` FOREIGN KEY (`id_artifact`) REFERENCES `qa_recording_artifact` (`id_artifact`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qa_recording_generation` (
	`id_generation` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	`id_session` BIGINT UNSIGNED NOT NULL,
	`kind` VARCHAR(30) NOT NULL,
	`status` VARCHAR(20) NOT NULL DEFAULT 'pending',
	`model` VARCHAR(120) NULL,
	`prompt_version` VARCHAR(40) NOT NULL DEFAULT 'v1',
	`output` MEDIUMTEXT NULL,
	`error_message` VARCHAR(500) NULL,
	`attempt_count` INT NOT NULL DEFAULT 0,
	`started_at` DATETIME NULL,
	`finished_at` DATETIME NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (`id_generation`),
	UNIQUE KEY `uq_qa_generation_session_kind` (`id_session`, `kind`),
	KEY `idx_qa_generation_status` (`status`),
	CONSTRAINT `fk_qa_generation_session` FOREIGN KEY (`id_session`) REFERENCES `qa_recording_session` (`id_session`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
