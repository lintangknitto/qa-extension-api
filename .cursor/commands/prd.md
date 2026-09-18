# /prd

Mode **orchestrator strict**. Root **HANYA** koordinator — jangan tulis PRD langsung.

User memberikan **prompt ide fitur** (bebas). AI agent menganalisa dan menghasilkan PRD terstruktur.

## Delegasi

1. Ekstrak dari prompt user: ide fitur, PB (jika ada), task slug (jika ada)
2. Jika **PB** atau **task slug** belum jelas → **AskQuestion** ke user sebelum delegasi
3. Optional: Task **`explore`** bila perlu peta modul `src/app/http/` untuk scope realistis
4. Task ke subagent **`knitto-agent-prd`** dengan:
   - Prompt user verbatim (atau ringkasan)
   - PB dan task slug yang sudah dikonfirmasi
   - Instruksi output: `docs/pb/{PB}/{task-slug}/prd.md`
5. **Jangan** delegasi ke `knitto-agent-feature` — PRD bukan implementasi kode

## Standar wajib subagent

- Skill [`prd-author`](../skills/prd-author/SKILL.md)
- Epic branch aktif: `feat/{PB}` (ingatkan user jika belum checkout)

## Output ke user

- Path PRD yang dibuat
- Open questions dari analisa
- Checklist: review PRD → commit → push → trigger pipeline di server ([`PANDUAN-WORKFLOW.md`](../../PANDUAN-WORKFLOW.md))
