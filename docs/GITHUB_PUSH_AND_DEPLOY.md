# GitHub Push & Production Deploy — Standard Procedure

**Trigger:** whenever the user says "push to GitHub", "push", "ship it", "deploy",
"deploy to Cloudflare", or any equivalent.

That instruction **is** the explicit authorization to merge the current feature
branch into `main`, push it, and let it deploy to production ahead of human
browser QA. Do not ask again — follow this file exactly.

Production: Cloudflare Pages auto-builds and deploys `main` to
`https://vertex-accounting.pages.dev` (Cloudflare Git integration — there is **no**
local `wrangler` step and no GitHub Actions deploy job).

Repo: `github.com/GerhardVanWijk/accountant_dashboard_ollama` (remote `origin`).

---

## 0. Identity & auth (verify once per session)

```bash
git config user.name      # gerhardvanwijk
git config user.email     # gerhard.ark.of.war@gmail.com   <-- REQUIRED author
gh auth status            # Active account MUST be: GerhardVanWijk (owns the repo)
```

- Author email **must** be `gerhard.ark.of.war@gmail.com`. If `git config
  user.email` differs, set it: `git config user.email gerhard.ark.of.war@gmail.com`
  (and, if commits were already made wrong, `git commit --amend --reset-author`
  before pushing).
- If the active `gh` account is not `GerhardVanWijk`:
  `gh auth switch --user GerhardVanWijk` (the `GerhardSLC` / `Gerhard29046`
  accounts lack push access).

## 1. Work must be committed on a feature branch

Never commit straight to `main`. Feature branch name: `<topic>-YYYY-MM-DD`.

Commit message shape (Conventional Commits):

```
<type>(<scope>): <subject>

<body — what changed and why, wrapped ~72 cols>

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: <the https://claude.ai/code/session_… URL from this session>
```

## 2. Run the FULL gate — all four must pass

```bash
npm run type-check
npm run lint -- --max-warnings 0
npm run test
npm run build
```

If anything fails: stop, fix, re-run. Do not push a red gate.

## 3. Fast-forward merge into `main`

```bash
git fetch origin
git checkout main
git merge --ff-only <feature-branch>
```

`--ff-only` must succeed. If it can't fast-forward, rebase the feature branch on
`origin/main` first (`git rebase origin/main` on the branch), re-run the gate,
then retry. Never force-push `main`.

## 4. Record the ship in `docs/CURRENT_TASKS.md`

Flip that task's status block to:

```
**SHIPPED YYYY-MM-DD** — on explicit user instruction ahead of human browser QA,
`<feature-branch>` was fast-forward-merged → `main` (`<old-sha>..<new-sha>`) +
pushed; Cloudflare Pages auto-deploys `main` to production
(`vertex-accounting.pages.dev`). <one line: migration/DB/accounting impact, or
"no migration, no DB write, no accounting effect">. **Post-deploy browser QA … is
now owed.**
```

Commit it **on `main`**:

```
docs: record <feature-branch> merge to main + prod deploy (YYYY-MM-DD, ahead of browser QA on explicit instruction)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: <session URL>
```

## 5. Push

```bash
git push origin main
git push origin <feature-branch>
```

## 6. Confirm the deploy is triggered

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://vertex-accounting.pages.dev
```

Expect `200`. The new build rolls out on Cloudflare's side within a few minutes —
there is nothing else to run locally.

## 7. Update memory

- `memory/MEMORY.md` line for the task → mark **MERGED → `main` `<sha>` +
  Cloudflare prod-deployed YYYY-MM-DD**.
- The task's own `memory/*.md` file → same.

## 8. Report back

State: branch, the `<old-sha>..<new-sha>` range, gate result (test count),
migration/DB/accounting impact, and that post-deploy browser QA is owed.

---

## Reference: the 2026-09-07 run this procedure was captured from

Branch `bank-detail-panel-txn-form-ux-2026-09-07`:

```bash
git config user.email                              # gerhard.ark.of.war@gmail.com
gh auth status                                      # Active: GerhardVanWijk
npm run type-check && npm run lint -- --max-warnings 0 && npm run test && npm run build
git fetch origin
git checkout main
git merge --ff-only bank-detail-panel-txn-form-ux-2026-09-07   # 0a1755b..868817f (ff)
#   ...edit docs/CURRENT_TASKS.md status block...
git add docs/CURRENT_TASKS.md
git commit -m "docs: record bank-detail-panel-txn-form-ux merge to main + prod deploy (2026-09-07, ahead of browser QA on explicit instruction)"  # + Co-Authored-By + Claude-Session trailers
git push origin main                               # 0a1755b..76afd20
git push origin bank-detail-panel-txn-form-ux-2026-09-07
curl -s -o /dev/null -w "%{http_code}" https://vertex-accounting.pages.dev   # 200
```
