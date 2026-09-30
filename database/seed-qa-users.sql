-- Reset & Seed Database QA Recorder (Knitto Tester)
-- Menyediakan schema bersih, user lengkap dengan role hierarki, sample projects, dan project assignments.

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `qa_recording_checkpoint`;
DROP TABLE IF EXISTS `qa_recording_generation`;
DROP TABLE IF EXISTS `qa_recording_artifact`;
DROP TABLE IF EXISTS `qa_recording_event`;
DROP TABLE IF EXISTS `qa_recording_session`;
DROP TABLE IF EXISTS `qa_test_case`;
DROP TABLE IF EXISTS `qa_user_project`;
DROP TABLE IF EXISTS `qa_project`;
DROP TABLE IF EXISTS `user`;

SET FOREIGN_KEY_CHECKS = 1;

-- 1. Tabel User
CREATE TABLE `user` (
	`id_user` INT UNSIGNED NOT NULL AUTO_INCREMENT,
	`nama` VARCHAR(150) NOT NULL,
	`username` VARCHAR(100) NOT NULL,
	`password` VARCHAR(255) NOT NULL,
	`level` VARCHAR(50) NOT NULL DEFAULT 'IMPLEMENTOR',
	`is_active` TINYINT(1) NOT NULL DEFAULT 1,
	`aktif` TINYINT(1) NOT NULL DEFAULT 1,
	`status_login` VARCHAR(20) NOT NULL DEFAULT 'FREE',
	`ip_addres` VARCHAR(100) NULL,
	`hint_password` VARCHAR(255) NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (`id_user`),
	UNIQUE KEY `uq_user_username` (`username`),
	KEY `idx_user_level` (`level`),
	KEY `idx_user_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabel Master Project
CREATE TABLE `qa_project` (
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

-- 3. Tabel Relasi User - Project (Scoping RBAC)
CREATE TABLE `qa_user_project` (
	`id_user` INT NOT NULL,
	`id_project` INT NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`created_by` INT DEFAULT NULL,
	PRIMARY KEY (`id_user`, `id_project`),
	KEY `idx_qa_user_project_project` (`id_project`),
	KEY `idx_qa_user_project_user` (`id_user`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabel Test Case
CREATE TABLE `qa_test_case` (
	`id_test_case` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	`id_project` BIGINT UNSIGNED NOT NULL,
	`test_case_no` VARCHAR(80) NOT NULL,
	`title` VARCHAR(255) NOT NULL,
	`description` TEXT NULL,
	`target_url` VARCHAR(1000) NULL,
	`test_type` VARCHAR(10) NOT NULL DEFAULT '+',
	`expected_result` TEXT NULL,
	`status` VARCHAR(20) NOT NULL DEFAULT 'Progress',
	`created_by_user_id` BIGINT NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (`id_test_case`),
	UNIQUE KEY `uq_qa_tc_project_no` (`id_project`, `test_case_no`),
	KEY `idx_qa_tc_project` (`id_project`, `created_at`),
	CONSTRAINT `fk_qa_tc_project` FOREIGN KEY (`id_project`) REFERENCES `qa_project` (`id_project`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabel Recording Session
CREATE TABLE `qa_recording_session` (
	`id_session` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	`id_project` BIGINT UNSIGNED NOT NULL,
	`id_test_case` BIGINT UNSIGNED NULL,
	`test_case_no` VARCHAR(80) NOT NULL,
	`title` VARCHAR(255) NOT NULL,
	`description` TEXT NULL,
	`target_url` VARCHAR(1000) NULL,
	`owner_user_id` BIGINT NOT NULL,
	`status` VARCHAR(20) NOT NULL DEFAULT 'recording',
	`result` VARCHAR(10) NULL,
	`actual_result` TEXT NULL,
	`last_sequence` BIGINT NOT NULL DEFAULT 0,
	`record_video` TINYINT(1) NOT NULL DEFAULT 1,
	`video_url` VARCHAR(1000) NULL,
	`share_token` VARCHAR(64) NULL,
	`started_at` DATETIME NULL,
	`ended_at` DATETIME NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`active_owner_key` BIGINT GENERATED ALWAYS AS (CASE WHEN `status` = 'recording' THEN `owner_user_id` ELSE NULL END) STORED,
	PRIMARY KEY (`id_session`),
	UNIQUE KEY `uq_qa_session_active_owner` (`active_owner_key`),
	UNIQUE KEY `uq_qa_session_share_token` (`share_token`),
	KEY `idx_qa_session_project` (`id_project`, `created_at`),
	KEY `idx_qa_session_owner` (`owner_user_id`, `created_at`),
	KEY `idx_qa_session_status` (`status`),
	CONSTRAINT `fk_qa_session_project` FOREIGN KEY (`id_project`) REFERENCES `qa_project` (`id_project`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Tabel Recording Event
CREATE TABLE `qa_recording_event` (
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

-- 7. Tabel Recording Artifact
CREATE TABLE `qa_recording_artifact` (
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

-- 8. Tabel Recording Checkpoint
CREATE TABLE `qa_recording_checkpoint` (
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

-- 9. Tabel Recording Generation
CREATE TABLE `qa_recording_generation` (
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

-- =========================================================================
-- SEED DATA
-- =========================================================================

-- Seed User untuk semua Role
INSERT INTO `user` (`id_user`, `nama`, `username`, `password`, `level`, `is_active`, `aktif`)
VALUES
	(1, 'Super Administrator', 'superadmin', md5('superadmin123'), 'SUPERADMIN', 1, 1),
	(2, 'QA Administrator', 'admin', md5('admin123'), 'ADMIN', 1, 1),
	(3, 'Senior QA Tester', 'qatester', md5('qatester123'), 'QA', 1, 1),
	(4, 'QA Lead Engineer', 'qaadmin', md5('qaadmin123'), 'QA', 1, 1),
	(5, 'Frontend Developer', 'developer', md5('developer123'), 'IMPLEMENTOR', 1, 1),
	(6, 'Backend Implementor', 'implementor', md5('implementor123'), 'IMPLEMENTOR', 1, 1),
	(7, 'Product Stakeholder', 'viewer', md5('viewer123'), 'VIEWER', 1, 1);

-- Seed Sample Projects
INSERT INTO `qa_project` (`id_project`, `name`, `code`, `description`, `base_url`, `is_active`, `created_by_user_id`)
VALUES
	(1, 'Knitto Portal E-Commerce', 'KNITTO-PORTAL', 'Automasi pengujian web katalog kain, cart, dan checkout pemesanan online', 'https://knitto.co.id', 1, 1),
	(2, 'Knitto Internal ERP & POS', 'KNITTO-ERP', 'Automasi pengujian modul stock gudang, transaksi kasir POS, dan master user', 'http://localhost:3000', 1, 1);

-- Seed User Project Scoping
INSERT INTO `qa_user_project` (`id_user`, `id_project`, `created_by`)
VALUES
	-- qatester (id=3): Akses Project 1 & 2
	(3, 1, 1),
	(3, 2, 1),
	-- developer (id=5): Akses Project 1 saja
	(5, 1, 1),
	-- implementor (id=6): Akses Project 2 saja
	(6, 2, 1),
	-- viewer (id=7): Akses Project 1 & 2 (read-only)
	(7, 1, 1),
	(7, 2, 1);
