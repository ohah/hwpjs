# Apply PR review suggestions locally (review-apply)

Fetch **review comments that contain suggestion blocks** from the PR for the current branch and apply those suggestions to the local files. This replicates GitHub's "Commit suggestion" locally.

## When to use

- Run this command from Cursor (e.g. command palette → "review-apply" or `/review-apply`).

## Order of operations

1. **Find the PR for the current branch**
   - If there is no PR, say "There is no PR for the current branch" and stop.

   ```bash
   gh pr view --json number,headRefOid
   ```

   - If that fails: `gh pr list --head $(git branch --show-current)` to confirm.

2. **Fetch review comments**

   ```bash
   gh api repos/ohah/hwpjs/pulls/<PR-number>/comments
   ```

   - Use `path`, `line`, `start_line`, and `body`.

3. **Keep only comments that have a suggestion block**
   - Include only comments whose `body` contains ` ```suggestion `.
   - Use a regex like `/```suggestion\s*([\s\S]*?)```/` to extract the **suggested code** from the block.
   - For each such comment, record: `path`, `line`, `start_line` (or treat as single-line if missing), and `suggestedCode` (extracted text; preserve line endings).

4. **When in doubt, ask the user**
   - **Do not apply** automatically; instead briefly describe the situation and ask: "Apply all? / Only some? / Skip?"
   - Do this when:
     - There are **two or more** suggestions for the **same file and same line** (or overlapping line range).
     - The **current content** at that line (or range) has changed a lot since the review, so pasting the suggestion might conflict or look wrong.
     - The **file** in `path` does not exist locally (e.g. moved or deleted).
     - The suggestion spans **multiple lines** but `start_line` is missing or the range is unclear.
   - Once the user says "apply all", "apply only this one", or "skip", proceed accordingly.

5. **Apply suggestions to local files**
   - For each chosen suggestion:
     - Open the file at `path`.
     - **Single line**: Replace the line at `line` with the suggested line(s). If the suggestion has multiple lines, replace from that line downward by the number of lines in the suggestion.
     - **Multiple lines** (when `start_line` and `line` exist): Replace the range `start_line` … `line` with the suggested code. If the suggested line count differs from the range length, replace using the suggested line count.
   - Preserve **indentation** as in the suggestion. If the suggestion has no trailing newline, only replace the intended line(s).

6. **Summarize what was applied**
   - List in short form which files and lines (or ranges) were updated.
   - Suggest: "Review the changes and use the `commit` command to commit when ready."

7. **Optionally update the PR body**
   - If at least one suggestion was applied, you may update the PR description.
   - Add a line under **Description** or **Additional info** in `branch-summary.md`: "Review suggestions applied: (short summary)."
   - Then PATCH the PR body:
     ```bash
     gh api repos/ohah/hwpjs/pulls/<PR-number> -X PATCH -f body=@branch-summary.md
     ```
   - Use the PR number from step 1. Whether to commit `branch-summary.md` is up to the author.

## Notes

- Run from the repo root with `gh` authenticated.
- Only **inline review comments** (on "Files changed") are used; general timeline comments are ignored.
- Only text inside ` ```suggestion ` … ` ``` ` is applied; other text in the comment is not.
- If the code has changed and line numbers or content no longer match, or if multiple suggestions target the same spot, **ask the user** before applying.
