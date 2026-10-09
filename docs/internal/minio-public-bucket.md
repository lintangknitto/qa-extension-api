# MinIO bucket publik (tanpa signature)

Sejak migration `003_recording_session_video_object_key.sql`, API tidak lagi membuat URL presigned untuk klien.
Upload dan download rekaman memakai URL langsung `${MINIO_PUBLIC_BASE_URL}/${MINIO_BUCKET}/<object_key>`,
jadi bucket harus diset **public read + write** di infra. Aplikasi tidak mengubah policy bucket.

> **Peringatan risiko.** Siapa pun yang bisa menjangkau MinIO bisa membaca, menimpa, atau menghapus file
> rekaman (video, screenshot, body network yang bisa memuat data pelanggan). Hanya pakai di jaringan internal.
> **Jangan pernah ekspos port MinIO ke internet.**

## 1. Set policy bucket

Dari container MinIO (contoh lokal `qa-recorder-infra-minio-1`):

```bash
docker exec qa-recorder-infra-minio-1 sh -c 'mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && mc anonymous set public local/qa-recording-artifacts'
```

Cek: `mc anonymous get local/qa-recording-artifacts` harus menampilkan `public`.

Verifikasi anonim dari mesin tester:

```bash
curl -X PUT --data hi http://<host-minio>:9000/qa-recording-artifacts/_probe/anon.txt   # 200
curl http://<host-minio>:9000/qa-recording-artifacts/_probe/anon.txt                    # hi
curl -X DELETE http://<host-minio>:9000/qa-recording-artifacts/_probe/anon.txt          # 204
```

## 2. Env API

| Env | Contoh | Keterangan |
|---|---|---|
| `MINIO_ENDPOINT` / `MINIO_PORT` | `host.docker.internal` / `9000` | Host yang dipakai API (server-side: `statObject`, upload langsung). |
| `MINIO_PUBLIC_BASE_URL` | `http://192.168.20.2:9000` | Host yang dijangkau **browser tester**. Wajib bila recording aktif. Trailing slash diabaikan. |

`video_url` dan URL artifact dihitung saat dibaca dari object key, jadi mengganti `MINIO_PUBLIC_BASE_URL`
langsung mengubah semua URL tanpa migrasi data. Skrip `db:regenerate-video-urls` sudah dihapus.

## 3. Data lama

Migration 003 mengisi `recording_sessions.video_object_key` dari `video_url` presigned lama
(host dan signature diabaikan). Video lama tetap bisa diputar tanpa regenerate.

## 4. Stack E2E

`tests/e2e/harness/disposable-stack.ts` menerapkan policy yang sama (`publicBucketPolicy`) ke bucket E2E.
