# Referensi PRD (PC / IDE)

Alur: **prompt user → analisa → PRD terstruktur**.

## Cara pakai

1. Checkout epic branch `feat/{{PB}}`
2. Chat Cursor dengan **`/prd`** + prompt ide + PB + task slug
3. Subagent **knitto-agent-prd** + skill **prd-author** menulis file

## Output

`docs/pb/{{PB}}/{{TASK}}/prd.md`

## Setelah selesai

1. Review PRD → commit + push ke `feat/{{PB}}`
2. Di server: pull + jalankan pipeline (tanpa stage PRD)

Lihat [`PANDUAN-WORKFLOW.md`](../../../PANDUAN-WORKFLOW.md) · [pc-workflow.md](../pc-workflow.md)
