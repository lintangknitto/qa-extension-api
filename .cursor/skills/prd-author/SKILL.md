---
name: prd-author
description: >-
  Playbook analisa prompt dan tulis PRD untuk knitto-agent-prd.
  Routing lewat orchestrator.mdc dan /prd.
---

# PRD author

Playbook: **prompt user → analisa → PRD terstruktur → simpan ke repo**.  
**PC workflow** — epic branch, commit, push. **Tidak** implementasi kode.

## Alur wajib (5 langkah)

1. **Terima prompt** — ide kasar user (chat, `/prd`, atau brief tertulis)
2. **Analisa** — ekstrak: masalah bisnis, aktor, constraint (auth, MySQL, RabbitMQ), endpoint kasar (jika disebut), ambigu
3. **Klarifikasi** — jika **PB** atau **task slug** belum jelas, tanya user sebelum menulis file; jangan tebak path folder
4. **Tulis PRD terstruktur** — format di bawah → simpan ke path wajib
5. **Konfirmasi ke user** — path file, open questions, instruksi commit + push

### Analisa prompt (checklist internal)

Sebelum menulis `prd.md`, jawab (mental atau catat di draft):

| Aspek | Pertanyaan |
|-------|------------|
| Problem | Apa pain point / kebutuhan bisnis? |
| Scope | Apa yang masuk vs sengaja di luar? |
| Acceptance | Kriteria sukses yang **bisa ditest**? |
| Integrasi | Auth guest path? DB? RabbitMQ? External API? |
| Keamanan | Constraint aktor/permission, data sensitif, endpoint publik — jika relevan (skill [`security-owasp-minimal`](../security-owasp-minimal/SKILL.md) untuk implementasi nanti) |
| Ambigu | Apa yang harus jadi **open questions**? |
| Existing code | Modul HTTP terkait di `src/app/http/`? (optional: baca singkat) |

**Optional:** baca codebase (`src/app/http/**`) hanya untuk scope realistis — **jangan** tulis plan layer/file di PRD.

## Output path (wajib)

```
docs/pb/{PB}/{task-slug}/prd.md
```

Contoh: `docs/pb/PB-1.700.3/user-history-endpoint/prd.md`

Buat folder jika belum ada. File **di-commit** ke epic branch; server pipeline baca setelah `git pull`.

## Format PRD (wajib)

```markdown
# PRD: {judul fitur}

## Metadata
- PB: {id}
- Task: {slug}
- Sumber prompt: {ringkasan 1 kalimat dari user}

## Problem statement
{1-3 paragraf — hasil analisa prompt}

## Scope
- In scope: ...
- Out of scope: ...

## Acceptance criteria
- [ ] ... (testable)
- [ ] ...

## Non-goals
- ...

## Open questions
- ... (dari analisa ambigu; kosongkan section jika tidak ada)
```

## Aturan

- Acceptance criteria **testable** — verifikasi via build/test/manual API
- **Bahasa Indonesia** untuk konten bisnis; istilah teknis API boleh English
- **Jangan** desain implementasi (layer, Valibot, `*.case.ts`) — itu plan + api-design di **server**
- **Jangan** ubah kode `src/` — hanya tulis/edit `docs/pb/.../prd.md`
- Jika user prompt sudah sangat detail, **strukturkan** ke format PRD; jangan copy-paste mentah tanpa analisa

## PRD vs plan

| Dokumen | Siapa | Fokus |
|---------|-------|-------|
| **PRD** | AI dari prompt user (PC) | What/why |
| **plan.md** | AI server | How — layer |
| **api-design.md** | AI server | Kontrak API |

Setelah push: [`PANDUAN-WORKFLOW.md`](../../../PANDUAN-WORKFLOW.md) · server pipeline [`.cursor/automation/README.md`](../../automation/README.md)
