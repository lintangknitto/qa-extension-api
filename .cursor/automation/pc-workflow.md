# Workflow PC → Server

Pemisahan tanggung jawab: **PRD di PC**, **development di server**.

## Alur PC (Anda)

```
Prompt ide  →  /prd  →  knitto-agent-prd  →  docs/pb/{PB}/{task}/prd.md  →  commit + push
```

1. Buat/checkout epic branch dari `main`:
   ```bash
   git checkout -b feat/PB-1.700.3 origin/main
   ```
2. Di Cursor IDE — berikan prompt + jalankan **`/prd`**:
   ```
   /prd
   PB: PB-1.700.3
   Task: user-history-endpoint

   Buat endpoint riwayat aktivitas user dengan pagination, hanya admin.
   ```
   Subagent **`knitto-agent-prd`** menganalisa prompt dan menulis PRD terstruktur.
3. Review `docs/pb/PB-1.700.3/user-history-endpoint/prd.md`
4. Commit + push:
   ```bash
   git add docs/pb/PB-1.700.3/user-history-endpoint/prd.md
   git commit -m "docs(PB-1.700.3): PRD user-history-endpoint"
   git push -u origin feat/PB-1.700.3
   ```

## Alur server (SSH)

1. Pull commit terbaru (termasuk PRD):
   ```bash
   git checkout feat/PB-1.700.3
   git pull origin feat/PB-1.700.3
   ```
2. Trigger pipeline (plan → dev → PR → review):
   ```bash
   node .cursor/automation/run-pipeline.mjs \
     --pb PB-1.700.3 \
     --task user-history-endpoint \
     --assignee your-github-username \
     --background
   ```
3. Pantau log: `.cursor/runs/PB-1.700.3/user-history-endpoint/pipeline.log`

**Tidak perlu `--prompt`** — PRD dibaca dari `docs/pb/.../prd.md`.

## Stage pipeline server

| Stage | Eksekutor | Input |
|-------|-----------|-------|
| git | shell | pull epic, buat task branch |
| plan | knitto-agent-planner | `docs/pb/.../prd.md` |
| dev | knitto-agent-feature | PRD + plan + api-design |
| pr | shell | commit + gh pr create |
| review | knitto-agent-reviewer | PR diff + plan |

Stage **PRD tidak ada** di server.

## Setelah pipeline

- Review & merge PR task → epic: **Anda**
- Merge epic → `releases/staging` / QA: **Anda**
- Merge epic → `main`: **Anda**
