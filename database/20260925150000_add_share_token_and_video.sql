-- 20260925150000 — Add share_token, video_url, record_video to qa_recording_session
-- Docs: chrome-extension/docs/prd/todo/session-share-video-replay/

ALTER TABLE `qa_recording_session`
	ADD COLUMN `share_token` VARCHAR(64) NULL AFTER `actual_result`,
	ADD COLUMN `video_url` VARCHAR(512) NULL AFTER `share_token`,
	ADD COLUMN `record_video` TINYINT(1) NOT NULL DEFAULT 1 AFTER `video_url`,
	ADD UNIQUE KEY `uq_qa_session_share_token` (`share_token`);
