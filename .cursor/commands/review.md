# Review a Pull Request (AI review and post summary + inline suggestions)

Fetch the PR for the current branch, have the AI review the code and description, then post **both** a **summary review (body)** and **line-level suggestions (inline comments)** to the PR.

- **Summary review**: Write a review body in English covering: whether the PR purpose and description match the changes, what's done well, improvement suggestions (bugs, edge cases, performance, tests), and testing notes.
- **Line-level suggestions**: For concrete code changes, add inline comments on the right file/line with a short explanation and, when applicable, a ` ```suggestion ``` ` block so the author can apply it on GitHub.

## gh account for this repo (ohah only)

This repo (ohah/hwpjs) uses the **ohah** GitHub account for posting reviews.

- **Before** submitting the review (`gh api .../reviews` or `gh pr comment`): get current user with `gh api user -q .login`. If the result is not `ohah`, run `gh auth switch --hostname github.com --user ohah` and **remember the previous login** (e.g. `PREV_GH_USER=<that value>`).
- **After** submitting the review: if you switched to ohah, restore the previous account with `gh auth switch --hostname github.com --user <PREV_GH_USER>` so the global gh account is unchanged.

## Order of operations

1. **Branch and gh account (this repo / ohah only)**
   - Run from the repo root. The review targets the **current branch**'s PR.
   - Get current gh user: `gh api user -q .login`. If not `ohah`, run `gh auth switch --hostname github.com --user ohah` and store the previous login so you can restore later.

2. **Find the PR for the current branch**
   - If there is no PR, say "There is no PR for the current branch" and stop.

   ```bash
   gh pr view --json number,title,body,url,additions,deletions,changedFiles
   ```

   - If that fails (no PR): `gh pr list --head $(git branch --show-current)` to confirm.

3. **Gather PR details and diff**
   - PR meta and body: `gh pr view`
   - Changed files: `gh pr diff --name-only`
   - Full diff: `gh pr diff`
   - Use this to build context for the review.

4. **Write the AI review (summary + line suggestions)**
   - **Summary body** (in English):
     - **Purpose and description**: Do the PR purpose and description match the changes?
     - **What's done well**: Structure, naming, conventions, consistency.
     - **Improvement suggestions**: Potential bugs, edge cases, performance, tests, and other recommendations.
   - **Line-level suggestions**: For each place that needs a change, prepare an inline comment with:
     - **path**: Repo-root-relative path (e.g. `crates/hwp-core/src/document/fileheader/mod.rs`)
     - **line**: Line number in the **new (right) side** of the diff.
     - **side**: `"RIGHT"`
     - **body**: Short explanation; if the change is a concrete code edit, include a ` ```suggestion ``` ` block so GitHub shows "Commit suggestion".

5. **Submit the review (summary + inlines together when there are inlines)**
   - **5-a. When there is at least one inline suggestion**
     Submit **one** review that includes both the **body** and the **comments** array.
     - **body**: The summary written in step 4 (what's done well, improvement summary, testing notes).
     - **comments**: One entry per suggestion, e.g.:
       - **path**: Repo-root-relative path
       - **line**: Line number on the **new (right)** side. Verify against the actual file.
       - **side**: `"RIGHT"`
       - **body**: Short description + (if applicable) ` ```suggestion ` … ` ``` ` block.
     - Example payload file (`review-payload.json`):
       ````json
       {
         "commit_id": "<headRefOid>",
         "event": "COMMENT",
         "body": "## AI review\n\n### What's done well\n- ...\n\n### Improvement suggestions\n- ...\n\n### Testing\n- ...",
         "comments": [
           {
             "path": "crates/hwp-core/src/document/fileheader/mod.rs",
             "line": 42,
             "side": "RIGHT",
             "body": "Consider adding error handling for invalid version numbers.\n\n```suggestion\n  if version < MIN_VERSION { return Err(...); }\n```"
           }
         ]
       }
       ````
     - Commands:
       ```bash
       gh pr view --json headRefOid -q .headRefOid   # use as commit_id
       gh api repos/ohah/hwpjs/pulls/$(gh pr view --json number -q .number)/reviews --input review-payload.json
       ```
     - You can delete `review-payload.json` after submitting.

   - **5-b. When there are no inline suggestions**
     Post only the summary as a single comment:

     ```bash
     gh pr comment $(gh pr view --json number -q .number) --body-file review-comment.md
     ```

     (Write the summary from step 4 into `review-comment.md` first. You can delete it after posting.)

   - **Rule**: If there are line-level suggestions, use 5-a (one review with body + comments). If not, use 5-b (comment only).

6. **Restore gh account (this repo / ohah only)**: If you switched to ohah in step 1, run `gh auth switch --hostname github.com --user <PREV_GH_USER>` to restore the original gh account.

## Notes

- Run from the repo root with `gh` authenticated. This repo (ohah/hwpjs): use ohah for posting reviews; switch gh before submit and restore after (see "gh account for this repo" and step 1, step 6).
- If the current branch has no PR, do not post a review; only output the message above.
- **Inline comments**: `line` must be the line number on the **new (right)** side of the diff; `side` is `"RIGHT"`. Wrong line numbers can cause 422; confirm against the actual file.
- **Suggestion blocks**: In the comment body, put the suggested code between ` ```suggestion ` and ` ``` ` so GitHub shows "Commit suggestion".
- Keep the review within GitHub's comment length limits; use bullets and short paragraphs.
