# Heartbeat — hwp-core 테스트 코드 작성 머신 (5분 주기)

**현재 일시중지.** (OpenClaw `agents.defaults.heartbeat` 설정이 꺼져 있으면 주기 실행되지 않음.)

이 파일을 읽고 아래 지시대로 **한 턴**에 수행하세요.  
할 일이 없으면 `HEARTBEAT_OK` 만 답하세요.

**대상:** 이 워크스페이스 **hwpjs** — 특히 **crates/hwp-core** 테스트 코드 작성.

---

## 매 턴 순서

1. **시작 브랜치**  
   **항상 main에서 작업 시작.** 현재 브랜치가 `main`이 아니면 `git checkout main` 후 진행.  
   (이전 턴에서 PR 올린 브랜치에 머물러 있으면 main으로 돌아온 뒤 다음 작업 진행.)

2. **테스트 작성 작업 1개**  
   `crates/hwp-core` 안에서 한 가지 테스트 작업을 진행 (단위 테스트 추가, 스냅샷 테스트 추가, 엣지 케이스 보강, 커버리지 확대 등).  
   변경 범위는 작게 유지.  
   **우선 후보:** 아래 "테스트 작성 후보"가 남아 있으면 그중 하나를 선택. **MEMORY.md의 "테스트 PR 기록"을 보고 이미 올린 PR과 겹치지 않게** 다른 세부 작업을 선택해 진행.

3. **빌드**  
   프로젝트 루트에서:
   ```bash
   cd /Users/yoonhb/Documents/workspace/hwpjs && cargo build -p hwp-core
   ```
   실패하면 이 턴에서 커밋하지 말고 원인 정리 후 종료.

4. **테스트 및 스냅샷**  
   ```bash
   cd /Users/yoonhb/Documents/workspace/hwpjs && cargo test -p hwp-core
   ```
   실패하면 커밋하지 말고 종료.

   **스냅샷 안내**
   - 테스트만으로는 스냅샷 파일이 자동 갱신되지 않음. 출력이 바뀌면 스냅샷 테스트가 **실패**하고, insta가 새 결과를 pending 상태로 남김.
   - 스냅샷 차이가 났을 때(테스트 실패 시) 검토·승인 절차:
     ```bash
     cd /Users/yoonhb/Documents/workspace/hwpjs && cargo insta review -p hwp-core
     ```
     (또는 `bun run test:rust:snapshot:review` — 워크스페이스 전체)
   - 대화형으로 각 변경을 **accept**(의도한 개선) 또는 **reject**(회귀) 선택. reject 시 저장된 스냅샷은 그대로 두고, 코드만 원복한 뒤 턴 종료.
   - **의도한 개선**이면 accept 후 5단계(커밋·브랜치·PR) 진행. **회귀**로 판단되면 reject 하고 코드 원복 후 턴 종료.
   - 한 턴에서 스냅샷을 자동 전부 accept 하지 말 것 (`cargo insta review --accept` 사용 금지).

5. **커밋·브랜치·PR (조건 충족 시에만)**  
   - 빌드·테스트 통과  
   - 스냅샷: 변화 없음 또는 의도한 개선만 accept함  
   → **테스트 코드는 항상 별도 브랜치로 PR.** main에 직접 푸시하지 않음.

   ```bash
   cd /Users/yoonhb/Documents/workspace/hwpjs
   git status
   # 변경 있으면:
   git add -A
   git commit -m "test(core): <한 줄 요약>"

   # 항상 브랜치 생성 후 푸시·PR
   git checkout -b test/<짧은-설명>
   git push -u origin test/<짧은-설명>
   gh pr create --base main --title "test(core): <한 줄 요약>" --body "테스트 추가/보강. 리뷰 후 머지."
   ```

   커밋 메시지는 `commit-rules.md` 형식 (test(core): …).

6. **PR 기록 및 main 복귀**  
   - PR 생성 후 **MEMORY.md**의 "테스트 PR 기록" 섹션에 이번 PR을 추가 (날짜, 브랜치, PR 번호/제목, 작업 요약). 겹치지 않게 하기 위함.
   - **main으로 체크아웃:** `git checkout main`  
   → 다음 턴은 항상 main에서 새 작업을 시작.

7. **응답**  
   위까지 처리한 뒤 `HEARTBEAT_OK` 또는 이번 턴 요약을 보내세요.

---

## 하지 말 것

- 빌드/테스트 실패한 상태에서 커밋·푸시하지 않기.
- 스냅샷 회귀가 있으면 그대로 커밋하지 말고 원복 후 턴 종료.
- **테스트 코드 커밋을 main에 직접 푸시하지 않기.** 항상 별도 브랜치 → PR.
- PR 올린 뒤 main으로 체크아웃하지 않고 다음 작업을 이어가기 (다음 턴은 반드시 main에서 시작).
- MEMORY.md에 PR 기록 없이 같은 유형 작업을 반복해 PR 겹치게 하기.

---

## 테스트 작성 후보

할 일이 없을 때 아래에서 **한 턴에 하나** 골라 진행. 끝난 항목은 목록에서 제거해 두기.

- **단위 테스트 추가**: `document/`, `viewer/core/`, `viewer/html/`, `viewer/markdown/` 등 모듈별로 `#[cfg(test)] mod tests` 또는 `tests/` 통합 테스트 추가. 파싱/렌더링 헬퍼, 경계값, 에러 경로 등.
- **스냅샷 테스트 추가**: `tests/fixtures/`에 새 HWP 추가 후 `snapshot_tests.rs`에 JSON/HTML/MD 스냅샷 케이스 추가. `common::find_fixture_file()` 사용.
- **엣지 케이스 보강**: 빈 문서, 최소 필드, 잘못된 바이트 등 예외/경계 입력에 대한 테스트 추가.
- **기존 fixture 커버리지 확대**: 이미 있는 fixture에 대해 아직 스냅샷이 없는 출력 형식(JSON/HTML/MD) 케이스 추가.
- **뷰어 단위 테스트**: `viewer/html/pagination.rs` 등 이미 `#[cfg(test)]`가 있는 곳 보강, 또는 다른 viewer 서브모듈에 단위 테스트 추가.
- **문서/스펙 기반 검증**: 스펙(`documents/docs/spec/`, `.cursor/skills/hwp-spec/`)과 일치하는지 검증하는 테스트(필드 존재, 자료형 등) 추가.
- **백로그 연동**: `documents/docs/backlog/`에 테스트 관련 항목이 있으면 해당 범위 테스트 작성.

---

## 참고

- 스냅샷 경로: `crates/hwp-core/tests/snapshots/`
- Fixtures 경로: `crates/hwp-core/tests/fixtures/`
- 스냅샷 검토(accept/reject): `cargo insta review -p hwp-core`
- 명세/가이드: `AGENTS.md`, `documents/docs/spec/`, `.cursor/skills/hwp-spec/`
