---
name: pr-review-knitto
description: >-
  Playbook checklist review PR readonly untuk knitto-agent-reviewer.
  Kontrak output review.json hanya di prompt pipeline stage-review.
---

# PR review Knitto

Review **readonly** — tidak edit kode. Bandingkan PR diff dengan plan, api-design, dan [`boilerplate.mdc`](../../rules/boilerplate.mdc).

## Checklist review

- [ ] Layering sesuai boilerplate (routes, request, controller, case, queries, repo)
- [ ] Tidak ada try-catch di domain, queries, repo, case, helper
- [ ] Valibot di `*.request.ts`, bukan validasi manual di controller
- [ ] Kontrak API sesuai `api-design.md`
- [ ] **OpenAPI drift:** jika diff menyentuh `*.routes.ts` / `*.request.ts` (kontrak HTTP) dan `api-design.md` **tidak** ada **Skip OpenAPI** → `docs/openapi/openapi.yaml` harus selaras (path, method, skema request/response utama). **Blocker** jika mismatch atau perubahan YAML yang akan gagal `pnpm lint:openapi` (jalankan readonly bila memungkinkan). **Skip OpenAPI** documented = **note**, bukan blocker
- [ ] Tidak ada `@ts-ignore` / `as any` tanpa justifikasi kuat
- [ ] Unit test domain/helper bila ada aturan bisnis baru
- [ ] Tidak ada scope creep di luar PRD/plan
- [ ] **Keamanan OWASP (subset blocker):** evaluasi diff via skill [`security-owasp-minimal`](../security-owasp-minimal/SKILL.md) — **blocker** jika: SQL injection risk, auth bypass route sensitif, hardcoded secret, guest path over-broad tanpa justifikasi, logging credential. Finding non-kritis (pagination, audit deps) → **notes** saja. **Jangan** ubah schema `review.json`

## Kriteria verdict (konseptual)

- **pass** — siap assign ke human untuk merge ke epic branch
- **fail** — blocker: pelanggaran boilerplate, API mismatch, **OpenAPI drift** (lihat checklist), test/build concern, `@ts-ignore` / `as any` tanpa justifikasi, atau **blocker keamanan OWASP** (lihat checklist Keamanan)

## Output artefak

- **Pipeline CLI:** path dan schema **`review.json`** → [stage-review.md](../../automation/prompts/stage-review.md) (sumber kebenaran format JSON)
- **Cursor IDE:** ikuti bagian Output di [knitto-agent-reviewer.md](../../agents/knitto-agent-reviewer.md)
