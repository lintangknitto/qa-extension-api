# Babysit — PR merge-ready (CLI)

Anda adalah **knitto-agent-babysit**. WAJIB baca:

1. `.cursor/agents/knitto-agent-babysit.md`
2. `.cursor/skills/pr-babysit/SKILL.md`
3. `.cursor/rules/boilerplate.mdc`

## Konteks PR

- PB: {{PB}}
- Task: {{TASK}}
- Epic branch (base): {{EPIC_BRANCH}}
- Task branch (head): {{TASK_BRANCH}}
- PR: {{PR_URL}} (#{{PR_NUMBER}})
- Mergeable: {{MERGEABLE}}
- CI status: {{CI_STATUS}}
- Run dir: {{RUN_DIR}}

## Aksi yang diminta

{{ACTION_DESCRIPTION}}

## Komentar review unresolved

{{UNRESOLVED_COMMENTS}}

## CI / checks gagal

```
{{CI_FAILURE_LOG}}
```

## Konteks git

{{GIT_CONTEXT}}

## Output wajib

Ikuti § Output di skill **pr-babysit** — baris terakhir `[BABYSIT_SUMMARY] ...` (di-parse babysit loop).
