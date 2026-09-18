---
name: pr-babysit
description: >-
  Playbook PR merge-ready untuk knitto-agent-babysit (conflict, CI, komentar review).
  Dipakai run-babysit CLI; routing IDE opsional via Task ke subagent.
---

# PR babysit (merge-ready)

Playbook menjadikan PR **merge-ready**: mergeable, CI green, komentar review valid ter-address. **Standar kode:** [`boilerplate.mdc`](../../rules/boilerplate.mdc). Untuk fix kode dalam diff PR, selaras [`debug-backend`](../debug-backend/SKILL.md) (scope minimal).

## Tujuan

- PR siap merge ke epic branch — **jangan auto-merge PR**
- Hanya perbaiki masalah dalam **diff PR ini** (komentar, CI, conflict)

## Aturan wajib

1. **Scope:** Conflict, CI failure, komentar unresolved yang valid — semua terkait perubahan PR.
2. **Larangan keras:**
   - Jangan auto-merge PR
   - Jangan force-push **epic branch** (base)
   - Jangan ubah PRD (`docs/pb/.../prd.md`)
   - Jangan ubah workflow CI (`.github/workflows/`) hanya agar pass
   - Jangan jalankan ulang pipeline plan→dev kecuali benar-benar perlu
   - Jangan refactor besar di luar scope komentar/CI
3. **Merge conflict:** Resolve dengan benar; jika intent bentrok dengan base, **stop** dan jelaskan — jangan tebak.
4. **Bugbot / reviewer:** Validasi setiap temuan sebelum fix; false positive → penjelasan singkat (commit atau PR comment).
5. **Setelah fix kode:** Wajib `pnpm build` dan `pnpm test` lulus sebelum commit.
6. **Commit:** Push ke **task branch** (head) saja. Format: `fix(pr): address review — <ringkasan>`
7. **Reply PR:** Boleh `gh pr comment` ringkas; jangan resolve thread jika fix belum push.

## Output (CLI babysit loop)

Di **baris terakhir** respons, tulis persis:

```
[BABYSIT_SUMMARY] <ringkasan singkat aksi yang dilakukan>
```

Baris ini di-parse otomatis oleh `run-babysit.mjs`.

## Skill terkait

| Situasi | Skill |
|---------|-------|
| Fix bug/CI dalam kode PR | `debug-backend` |
| Komentar minta ubah kontrak API / fitur baru | Eskalasi human — bukan babysit scope penuh |
