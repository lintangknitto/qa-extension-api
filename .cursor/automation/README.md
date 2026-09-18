# Cursor CLI Dev Pipeline (Server)

Pipeline development di server: **plan → dev → PR → review → assign**.

**PRD ditulis di PC** pada epic branch, di-push, lalu server `git pull` sebelum trigger.

**Panduan penggunaan (cheat sheet):** [`PANDUAN-WORKFLOW.md`](../../PANDUAN-WORKFLOW.md)

- PC workflow: [`pc-workflow.md`](./pc-workflow.md)
- PRD path: [`docs/pb/README.md`](../../docs/pb/README.md)
- Orchestrator: [`pipeline-orchestrator.md`](./pipeline-orchestrator.md)

## Prasyarat server

| Tool | Catatan |
|------|---------|
| Node.js **24.18.0** | `.nvmrc` / `engines` |
| pnpm **11.17.0** | `packageManager` + Corepack |
| [Cursor CLI](https://cursor.com/docs/cli/using) | `agent` di PATH |
| `CURSOR_API_KEY` | Headless auth |
| GitHub CLI | `gh auth login` |
| Git | |

Config: [`config.example.env`](./config.example.env) → `config.env`

## Branch stacked

| Branch | Peran |
|--------|-------|
| `feat/PB-1.700.3` | Epic (PRD di-commit dari PC) |
| `feat/PB-1.700.3-user-history` | Task (head PR) |

## Menjalankan (server, setelah pull)

```bash
git checkout feat/PB-1.700.3
git pull origin feat/PB-1.700.3

node .cursor/automation/run-pipeline.mjs \
  --pb PB-1.700.3 \
  --task user-history-endpoint \
  --assignee your-github-username
```

PRD harus ada di: `docs/pb/PB-1.700.3/user-history-endpoint/prd.md`

### Flags

| Flag | Fungsi |
|------|--------|
| `--pb` | ID PB (wajib) |
| `--task` | Task slug (wajib) |
| `--assignee` | GitHub username setelah review pass |
| `--from-stage` | `git\|plan\|dev\|pr\|review` |
| `--resume` | Lanjut dari `state.json` |
| `--dry-run` | Print perintah (skip validasi PRD file) |
| `--background` | Detach + log ke run dir |
| `--no-heal` | Fail fast tanpa heal otomatis |
| `--max-heal-retries N` | Override batas heal semua stage |

`--prompt` **tidak dipakai** — PRD dari repo.

### Heal-agent

Saat stage gagal, pipeline memanggil **heal-agent** (Cursor CLI) untuk memperbaiki error lalu retry stage yang sama. Batas retry per stage bisa diatur via env (`HEAL_MAX_RETRIES_*`) atau `--max-heal-retries`.

Review stage khusus: jika blockers menyentuh kode/tests/build → heal via `knitto-agent-feature` dan restart dari stage `dev`. Jika hanya artifact docs/review → heal via `knitto-agent-reviewer` dan retry `review`.

### Kontrak `state.json`

File di `.cursor/runs/{PB}/{task}/state.json` — dibaca Discord orchestrator.

| Field | Tipe | Keterangan |
|-------|------|------------|
| `status` | `running` \| `failed` \| `completed` | Status pipeline |
| `stage` | string | Stage aktif / yang gagal |
| `error` | string \| null | Pesan error terakhir |
| `retryCount` | number | Total heal attempt run ini |
| `stageRetryCount` | object | Heal count per stage |
| `maxRetries` | number \| null | Override global dari CLI |
| `lastHealAt` | ISO \| null | Waktu heal terakhir |
| `healSummary` | string \| null | Ringkasan heal terakhir |
| `finishedAt` | ISO \| null | Waktu selesai (completed/failed final) |
| `startedAt`, `updatedAt` | ISO | Timestamp run |

Field legacy (tetap ada): `pb`, `task`, `assignee`, `epicBranch`, `taskBranch`, `completedStages`, `currentStage`, `prUrl`, `reviewVerdict`, `runPath`, `prdPath`.

Orchestrator helpers: `isOrchestratorSuccess` → `status === completed`; `isOrchestratorFailure` → `status === failed`.

`--resume` setelah `failed`: reset `retryCount` dan `stageRetryCount`, lanjut dari `state.stage`.

### Background

```bash
node .cursor/automation/run-pipeline.mjs \
  --pb PB-1.700.3 \
  --task user-history-endpoint \
  --assignee your-user \
  --background
```

## Artifact

| Lokasi | Isi | Git |
|--------|-----|-----|
| `docs/pb/{PB}/{task}/prd.md` | PRD | **Commit** (PC) |
| `.cursor/runs/{PB}/{task}/` | plan, api-design, review, state | Gitignore |

## Subagent server

| Stage | Subagent |
|-------|----------|
| Plan | `knitto-agent-planner` |
| Dev | `knitto-agent-feature` |
| Review | `knitto-agent-reviewer` |

PRD di PC: **`knitto-agent-prd`** — lihat [`agents/README.md`](../agents/README.md)

## Babysit PR (merge-ready loop)

Setelah PR task→epic **sudah open**, babysit (`knitto-agent-babysit` + skill `pr-babysit`) menangani komentar reviewer/Bugbot unresolved, CI merah, dan merge conflict — **bukan** heal-agent pipeline.

```bash
node .cursor/automation/run-babysit.mjs --pr 123 --background

# atau
node .cursor/automation/run-babysit.mjs \
  --pb PB-1.700.2 \
  --task migrate-node-version \
  --background
```

### Flags babysit

| Flag | Fungsi |
|------|--------|
| `--pr` | Nomor PR atau URL GitHub (wajib jika tanpa pb+task) |
| `--pb` | PB id (alternatif, resolve PR dari head branch) |
| `--task` | Task slug (wajib bersama `--pb`) |
| `--background` | Detach + log ke `babysit.log` |
| `--max-retries N` | Override `BABYSIT_MAX_RETRIES` |
| `--dry-run` | Print rencana tanpa eksekusi agent/git push |

Env: `BABYSIT_MAX_RETRIES`, `BABYSIT_CI_POLL_INTERVAL_MS`, `BABYSIT_CI_POLL_TIMEOUT_MS` — lihat [`config.example.env`](./config.example.env).

**Tidak** auto-merge PR. **Tidak** ubah PRD atau workflow CI hanya agar pass.

### Kontrak `state.json` mode babysit

Babysit memperluas file yang sama `.cursor/runs/{PB}/{task}/state.json` dengan `mode: "babysit"`. Field pipeline tetap ada.

| Field | Tipe | Keterangan |
|-------|------|------------|
| `mode` | `"babysit"` | Beda dari run pipeline (absent / `"pipeline"`) |
| `status` | `running` \| `failed` \| `completed` | Status babysit |
| `prUrl`, `prNumber` | string, number | PR yang di-babysit |
| `mergeable` | boolean | PR mergeable (bukan CONFLICTING) |
| `ciStatus` | `success` \| `pending` \| `failure` | Rollup CI checks |
| `unresolvedComments` | number | Jumlah thread review unresolved |
| `retryCount` | number | Iterasi fix yang sudah dilakukan |
| `maxRetries` | number | Batas loop |
| `lastAction` | string \| null | Aksi terakhir |
| `error` | string \| null | Pesan eskalasi jika failed |
| `startedAt`, `finishedAt`, `updatedAt` | ISO | Timestamp |

Log babysit: `.cursor/runs/{PB}/{task}/babysit.log` (terpisah dari `pipeline.log`).

Orchestrator: `isOrchestratorBabysitSuccess` / `isOrchestratorBabysitFailure` di `lib/pipeline-state.mjs`; cek `state.mode === "babysit"`.

## Fix pipeline (bug di epic)

Bugfix di epic **tanpa PRD** — input wajib dari **GitHub issue**. Orchestrator buat issue dulu, lalu spawn `run-fix.mjs`.

```bash
node .cursor/automation/run-fix.mjs \
  --pb PB-1.700.2 \
  --task login-timeout \
  --github-issue 456 \
  --assignee your-github-username \
  --background
```

### Flags fix

| Flag | Fungsi |
|------|--------|
| `--pb` | ID PB (wajib) |
| `--task` | Task slug fix (wajib) |
| `--github-issue` | Nomor atau URL GitHub issue (wajib run baru) |
| `--assignee` | GitHub username setelah review pass |
| `--from-stage` | `git\|fix\|pr\|review` |
| `--resume` | Lanjut dari `state.json` + `issue.md` |
| `--dry-run` | Print rencana tanpa eksekusi |
| `--background` | Detach + log ke `fix.log` |
| `--max-retries N` | Override `FIX_MAX_RETRIES` stage fix |

Branch: `fix/{PB}-{task}` → base epic `feat/{PB}`. PR body sertakan `Fixes #N`.

Stage: `git → fix (debugger) → pr → review → assign`. Subagent fix: `knitto-agent-debugger`.

### Kontrak `state.json` mode fix

| Field | Keterangan |
|-------|------------|
| `mode` | `"fix"` |
| `githubIssueNumber`, `githubIssueUrl` | Issue sumber |
| `issuePath` | Path ke `issue.md` di run dir |
| `prKind` | `"fix"` |
| `fixSummary` | Ringkasan fix terakhir |

Log: `.cursor/runs/{PB}/{task}/fix.log`. Orchestrator: `isOrchestratorFixSuccess` / `isOrchestratorFixFailure`.
