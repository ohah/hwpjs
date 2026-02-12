# Create or Update a Pull Request

Create or update a PR for the current branch. Follow the steps below.

## What the agent should do

1. **Check current branch and PR status**: `git branch --show-current`, `gh pr list --head <current-branch> --state all`
2. **If an open PR already exists for the current branch**: Do not create a new branch or a new PR. Add new commits to the current branch and push; the existing PR will automatically include them. Optionally update the PR body (and labels) via PATCH.
3. **Determine base**: If the user specifies a base branch (e.g. "base is main", "base feat/xyz"), use that as the merge target.
   - **If current branch equals base** → Create a new branch from the current one and open a PR with that new branch as head (see "When base and current branch are the same").
   - Otherwise use the specified base.
4. **Prepare body**: If `branch-summary.md` exists and fills the required sections (Purpose, Description, How to test, etc., or Title + Work content), use it as the PR body. If sections are missing, fill them before use.
5. **Create or update PR**:
   - No open PR → `gh pr create --head <current-branch> --base <base> --title "<title>" --body-file branch-summary.md`
   - Open PR exists → Update body (and base via PATCH if base was specified and PR is open).
6. **Push**: If there are unpushed commits, run `git push origin <current-branch>`.
7. **Labels**: After creating or updating the PR, check `gh label list` and add labels that match the PR (e.g. feat, fix, docs).

## Base branch (apply when user specifies it)

- If the user **specifies a base branch** (e.g. "base is main", "base feat/menu-board"), **always** use that branch as the merge target (base).
- **On create**: Pass `--base <user-specified-branch>` to `gh pr create`.
- **On update**: If the PR is **open**, update the base via REST PATCH. If the PR is **closed**, base cannot be changed (update body only).
  ```bash
  gh api repos/ohah/hwpjs/pulls/<PR-number> -X PATCH -f body=@branch-summary.md -f base="<user-specified-branch>"
  ```
  (If 422 on base change, treat as closed PR and PATCH body only.)

## When base and current branch are the same

- If the user set base=XXX and **the current branch is also XXX**, self-merge is not allowed. **Create a new branch** from the current one and use that as the PR head.
- Steps:
  1. From the current branch (XXX), create a new branch: `git checkout -b feat/xxx-description` (name it by the work).
  2. If there are uncommitted changes, stage and commit (and push) on the new branch.
  3. `gh pr create --head <new-branch> --base XXX --title "..." --body-file branch-summary.md --assignee @me`
  4. Push the new branch: `git push -u origin <new-branch>`

## gh account and SSH remote (optional)

If this repo uses a specific GitHub account or SSH host for push/PR:

- **SSH remote**: Ensure `origin` points to the correct URL (e.g. `git@github.com:ohah/hwpjs.git` or a custom SSH host from `~/.ssh/config`). Adjust with `git remote set-url origin <url>` if needed.
- **gh auth switch**: Before push or `gh pr create` / PATCH: get current user with `gh api user -q .login`. If a specific user is required, run `gh auth switch --hostname github.com --user <that-user>` and **remember the previous login**. **After** all push and gh PR operations, restore with `gh auth switch --hostname github.com --user <PREV_GH_USER>`.

## Order of operations

1. **Read user input**: If a base branch is specified, set base accordingly (see above).
2. **Remote**: Ensure `origin` is set as needed for push (see "gh account and SSH remote" if the project requires it).
3. **gh account**: If the project uses a specific gh user, get current user: `gh api user -q .login`. Switch if needed and store the previous login so you can switch back later.
4. **Create or update PR with GitHub CLI**:
   - If the branch is already pushed → use `--head <branch-name>` when creating.
   - If base is specified → always pass `--base <base>` on create, or include base in PATCH on update (when PR is open).

   ```bash
   gh pr create --head $(git branch --show-current) --base <base> --title "<title>" --body-file branch-summary.md
   ```

   - If a PR already exists → Update body. If base was specified and PR is open, PATCH body and base.

   ```bash
   # body only:
   gh api repos/ohah/hwpjs/pulls/<PR-number> -X PATCH -f body=@branch-summary.md
   # body + base:
   gh api repos/ohah/hwpjs/pulls/<PR-number> -X PATCH -f body=@branch-summary.md -f base="<base>"
   ```

5. **Push**: After create/update, if there are unpushed commits, push so the PR has the latest commits.

   ```bash
   git push origin $(git branch --show-current)
   ```

6. **If `gh` is not available**: Install [GitHub CLI](https://cli.github.com/) or open the PR in the browser (repo → Compare & pull request for the branch) and paste the contents of `branch-summary.md` as the description.

7. **Labels**: On create use `--label <name>` (multiple allowed). On update use `gh pr edit <PR-number> --add-label <name>`. Choose labels from `gh label list` that fit the PR (e.g. feat, fix, docs, config).

8. **Restore gh account**: If you switched to another user in step 3, run `gh auth switch --hostname github.com --user <previous-login>` to restore the original gh account.

## PR title rules

- **If the user provides a title**: Use it as-is.
- **If the user provides an issue ref** (e.g. `/pr fixes #123`): Use a prefix like `[#123]` and a short subject.
- **If neither**: Use a short, imperative subject (e.g. from the first line of branch-summary or the main change). Prefer lowercase start and no trailing period.

## PR body format

Use `branch-summary.md` as the PR body. It should include at least:

- **Title** (or Purpose): What this PR is for.
- **Work content** (or Description): What was changed and why, in prose. If tests were added or updated, say so (e.g. "Tests were added for …" or "Test coverage includes …").

If the repo has `.github/PULL_REQUEST_TEMPLATE.md`, align `branch-summary.md` with its sections (Purpose, Description, How to test, Additional info, Screenshots, etc.) when writing or updating it.

## Notes

- **Existing PR**: If the current branch already has an open PR, do not create a new branch or new PR. Push new commits to the same branch so they are added to that PR; update body/labels if needed.
- **Base**: If the user specifies a base branch, always use it for create/update (and create a new head branch when base and current branch are the same).
- **Body**: Keep `branch-summary.md` up to date and use it only for the PR description; do not commit it unless the project says otherwise.
- **Push**: After updating the PR body, push any unpushed commits so the PR reflects the latest code.
- **Labels**: Use `gh label list` and attach labels that match the PR type (feat, fix, docs, etc.).
