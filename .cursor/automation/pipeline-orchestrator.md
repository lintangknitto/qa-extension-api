# Pipeline orchestrator (server CLI)

Orkestrasi development via Cursor CLI di server. **Bukan** orchestrator IDE ([`orchestrator.mdc`](../rules/orchestrator.mdc)).

**PRD ditulis di PC** — lihat [`pc-workflow.md`](./pc-workflow.md) dan [`docs/pb/README.md`](../../docs/pb/README.md).

## Alur stage (server)

| Stage | ID | Eksekutor | Input / Output |
|-------|-----|-----------|----------------|
| 0 | `git` | Shell (`git`, `gh`) | Pull epic + task branch |
| 1 | `plan` | `knitto-agent-planner` | Baca `docs/pb/{PB}/{task}/prd.md` → `plan.md`, `api-design.md` |
| 2 | `dev` | `knitto-agent-feature` | Implementasi + `pnpm build/test` |
| 3 | `pr` | Shell | PR ke epic branch |
| 4 | `review` | `knitto-agent-reviewer` (readonly) | `review.json`, assign PR |

## Git stacked

- Epic branch: `feat/{PB}` (contoh `feat/PB-1.700.3`) — PRD di-commit di sini dari PC
- Task branch: `feat/{PB}-{task-slug}`
- PR **base** = epic; **head** = task
- Merge epic → release branches / `main` = **manual human**

## Gate antar stage

- Pre-flight: `docs/pb/{PB}/{task}/prd.md` **wajib ada** (setelah pull)
- Stage plan butuh PRD; stage dev butuh plan + api-design di `.cursor/runs/`
- Stage dev wajib `pnpm build` + `pnpm test` sukses sebelum PR
- Review **pass** → assign ke `GITHUB_ASSIGNEE`; **fail** → comment blockers, exit non-zero

## Larangan pipeline

- Jangan generate PRD di server (PC only)
- Jangan `git push --force` ke `main` / `master`
- Jangan merge PR otomatis
- Reviewer **readonly**

## Standar kode

[`boilerplate.mdc`](../rules/boilerplate.mdc)
