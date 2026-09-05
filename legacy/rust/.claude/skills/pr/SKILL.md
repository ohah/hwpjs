---
description: 현재 브랜치의 변경사항을 기반으로 GitHub Pull Request를 생성해주세요.
user_invocable: true
---

현재 브랜치의 변경사항을 기반으로 GitHub Pull Request를 생성해주세요.

1. `git status`로 커밋되지 않은 변경사항이 있는지 확인하고, 있으면 커밋 먼저 진행
2. `git log main..HEAD`로 현재 브랜치의 커밋 히스토리 확인
3. `git diff main...HEAD`로 전체 변경사항 파악
4. 변경사항을 분석하여 PR 제목과 본문 작성
5. 리모트에 push 후 `gh pr create`로 PR 생성
6. PR에 assignee를 `ohah`로, 적절한 label을 추가

PR 본문 형식:
```
## Summary
<변경사항 요약 1-3줄>

## Test plan
<테스트 체크리스트>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

PR 생성 후:
- `gh pr edit --add-assignee ohah`
- `gh pr edit --add-label <적절한 라벨>` (enhancement, bug, documentation 등)
