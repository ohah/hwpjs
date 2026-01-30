# PR 전 gh 계정·SSH 설정 (이 레포 전용)

이 레포(ohah/hwpjs)에서는 **ohah** GitHub 계정으로 push·PR을 사용한다.

## 해야 할 것

- **SSH remote**: push가 ohah SSH 키를 쓰도록 origin을 `github.com-private` 로 맞춘다. (한 번만 하면 됨.)
  ```bash
  git remote set-url origin git@github.com-private:ohah/hwpjs.git
  ```
  `~/.ssh/config` 에 `Host github.com-private` 가 ohah용 키를 쓰도록 설정되어 있어야 한다.
- **gh**: `gh auth switch` 로 ohah 계정을 쓰면 된다.

## 수동으로 할 때

이 레포에서 PR 만들기·푸시 전에:

```bash
gh auth switch --hostname github.com --user ohah
```

작업 끝난 뒤 다른 레포로 갈 때, 원래 쓰던 계정으로 돌리려면:

```bash
gh auth switch --hostname github.com --user <원래_계정명>
```

## /pr 커맨드 동작

`/pr` 실행 시 에이전트가 자동으로:

1. origin이 `git@github.com-private:ohah/hwpjs.git` 인지 확인하고, 아니면 **한 번 설정**한 뒤
2. 현재 gh 로그인 계정을 확인하고,
3. ohah가 아니면 **일시적으로 ohah로 전환**한 뒤 push·PR 생성/수정을 하고,
4. **다시 원래 계정으로 전환**한다.

그래서 `/pr` 한 번 실행해도 전역 gh 설정은 원래대로 유지된다.
