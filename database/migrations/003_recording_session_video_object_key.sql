-- MinIO bucket public (tanpa signature): simpan object key video, URL dihitung saat dibaca dari MINIO_PUBLIC_BASE_URL.
ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS video_object_key VARCHAR(500);

-- Backfill dari video_url presigned lama (host & signature diabaikan), sama dengan logika videoObjectKeyFromUrl lama.
UPDATE recording_sessions
SET video_object_key = substring(video_url from 'sessions/[0-9]+/[^?&]+')
WHERE video_object_key IS NULL
  AND video_url IS NOT NULL
  AND substring(video_url from 'sessions/[0-9]+/[^?&]+') IS NOT NULL;
