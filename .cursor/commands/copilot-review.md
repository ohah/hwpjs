# Apply GitHub Copilot review feedback

Review Copilot feedback on a branch/PR and apply the suggested changes.

## Input

- **Branch/PR link** (optional): User may provide the link (e.g. `https://github.com/ohah/hwpjs/pull/123`). If not provided, use GitHub CLI to find the PR for the **current branch**:
  ```bash
  gh pr view --json number,url  # from repo root; fails if no PR for current branch
  # or
  gh pr list --head $(git branch --show-current) --state open --json number,url
  ```
  - If exactly one PR exists for the current branch, use that PR. If none or multiple, ask the user for the PR link (or pasted review text).
- **Review text**: User may paste Copilot review text directly; use that as the source of feedback.

## Steps

1. **Get the review**:
   - If the user pasted a PR link: open or fetch that PR and find the GitHub Copilot review (summary and/or file comments).
   - If the user did **not** provide a link: run `gh pr view` from the repo root (or `gh pr list --head $(git branch --show-current) --state open`). If one PR is found for the current branch, use that PR; otherwise say "No PR for the current branch" or "Multiple PRs found" and ask for the PR link.
   - If the user pasted the review text directly: use that as the source of feedback.
   - With the PR: use `gh pr view <number>` or the web URL to check the PR conversation for Copilot review.

2. **Read the feedback**:
   - Summarize what Copilot suggested (e.g. style, security, logic, tests).
   - Identify which files and lines each comment refers to.

3. **Apply the changes**:
   - Edit the codebase to address each suggestion where it makes sense.
   - Prefer accepting suggestions that improve correctness, security, or maintainability; skip or adapt ones that conflict with project rules or intent.
   - Run format/lint after edits (`bun run format`, `bun run lint` for TS/JS; `cargo fmt`, `cargo clippy` for Rust).

4. **Reply to the user**:
   - List what was changed and what was skipped (and why, if relevant).
   - Ask for the PR link (or pasted review text) only when no PR was found for the current branch via `gh pr view` / `gh pr list`, or when the user needs to specify a different PR.

5. **Update PR content** (after applying Copilot review):
   - Add to `branch-summary.md` (or the PR description source) a short section describing what Copilot suggested and what was applied (e.g. "Copilot review: applied naming conventions, added error handling, improved test coverage").
   - If the branch is already pushed and a PR exists, suggest or run `gh pr edit --body-file branch-summary.md` so the PR description reflects the Copilot review work. Do not commit `branch-summary.md`; it is used only for the PR body.

6. **Resolve review threads** (after applying feedback):
   - For each Copilot comment thread that was addressed, mark the conversation as **resolved** on GitHub so the PR does not show unresolved threads.
   - **Web**: PR → "Files changed" → open each comment → "Resolve conversation".
   - **CLI**: `gh` has no built-in resolve command; use GraphQL: `gh api graphql -f query='mutation { resolveReviewThread(input: { threadId: "PRRT_xxx" }) { thread { isResolved } } }'` with the thread ID from the PR (e.g. from `pull-requests/pr-N/comments.json` or the review comment payload). Run once per unresolved thread.

## Notes

- **PR source**: If the user did not provide a link, first run `gh pr view` (or `gh pr list --head $(git branch --show-current)`) to see if the current branch has a PR; use it when exactly one is found. Ask for the PR link or pasted review text only when no PR is found or the user must specify a different PR.
- Do not commit automatically; let the user review the diff and run `/commit` if they want to commit.
- After applying Copilot review, always update the PR content (branch-summary.md) and optionally refresh the PR body with `gh pr edit --body-file branch-summary.md`.
- After applying feedback, resolve the addressed review threads on GitHub (web "Resolve conversation" or `gh api graphql` with `resolveReviewThread` and the thread ID).
