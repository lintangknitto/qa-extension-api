-- 20260924150000_create_qa_test_case.sql
-- Master Test Case per Project & Sinkronisasi Sesi Recording

CREATE TABLE IF NOT EXISTS `qa_test_case` (
  `id_test_case` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_project` BIGINT UNSIGNED NOT NULL,
  `group_no` VARCHAR(50) NULL,
  `feature` VARCHAR(150) NULL,
  `process_no` VARCHAR(50) NULL,
  `test_type` VARCHAR(10) NOT NULL DEFAULT '+',
  `test_case_id` VARCHAR(80) NOT NULL,
  `test_variable` VARCHAR(255) NULL,
  `title` VARCHAR(255) NOT NULL,
  `pre_condition` TEXT NULL,
  `test_data` TEXT NULL,
  `test_steps` TEXT NULL,
  `expected_result` TEXT NULL,
  `actual_result` TEXT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'Progress',
  `evidence` TEXT NULL,
  `remarks` TEXT NULL,
  `automation_tools` VARCHAR(100) NULL,
  `last_session_id` BIGINT UNSIGNED NULL,
  `created_by_user_id` BIGINT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_test_case`),
  KEY `idx_tc_project_id` (`id_project`, `test_case_id`),
  KEY `idx_tc_project_status` (`id_project`, `status`),
  CONSTRAINT `fk_tc_project` FOREIGN KEY (`id_project`) REFERENCES `qa_project` (`id_project`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `qa_recording_session` MODIFY COLUMN `id_project` BIGINT UNSIGNED NULL;

ALTER TABLE `qa_recording_session` ADD COLUMN `id_test_case` BIGINT UNSIGNED NULL AFTER `id_project`;
ALTER TABLE `qa_recording_session` ADD CONSTRAINT `fk_qa_session_test_case` FOREIGN KEY (`id_test_case`) REFERENCES `qa_test_case` (`id_test_case`) ON DELETE SET NULL;
