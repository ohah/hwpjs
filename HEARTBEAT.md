# Heartbeat — hwp/core 리팩터 머신 (5분 주기)

이 파일을 읽고 아래 지시대로 **한 턴**에 수행하세요.  
할 일이 없으면 `HEARTBEAT_OK` 만 답하세요.

**대상:** 이 워크스페이스 **hwpjs** — 특히 **crates/hwp-core** 리팩터링.

---

## 매 턴 순서

1. **리팩터 작업 1개**  
   `crates/hwp-core` 안에서 한 가지 리팩터를 진행 (가독성, 구조 정리, 명세 정합성, 경고 제거 등).  
   변경 범위는 작게 유지.  
   **우선 후보:** 아래 "리팩터 후보"가 남아 있으면 그중 하나를 선택해 진행.

2. **빌드**  
   프로젝트 루트에서:
   ```bash
   cd /Users/yoonhb/Documents/workspace/hwpjs && cargo build -p hwp-core
   ```
   실패하면 이 턴에서 커밋하지 말고 원인 정리 후 종료.

3. **테스트 및 스냅샷**  
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
   - **의도한 개선**이면 accept 후 4단계(커밋/푸시 또는 PR) 진행. **회귀**로 판단되면 reject 하고 코드 원복 후 턴 종료.
   - 한 턴에서 스냅샷을 자동 전부 accept 하지 말 것 (`cargo insta review --accept` 사용 금지).

4. **커밋 및 푸시 (조건 충족 시에만)**  
   - 빌드·테스트 통과  
   - 스냅샷: 변화 없음 또는 의도한 개선만 accept함  
   → 커밋까지 진행. **단, 이번 턴에서 스냅샷이 변경된 경우** main 푸시 대신 **PR**로 올리기.

   ```bash
   cd /Users/yoonhb/Documents/workspace/hwpjs
   git status
   # 변경 있으면:
   git add -A
   git commit -m "refactor(core): <한 줄 요약>"

   # 스냅샷이 바뀌지 않았으면: main 푸시
   # git push origin main

   # 스냅샷이 바뀌었으면: 브랜치 푸시 후 gh로 PR 생성
   # git checkout -b refactor/<짧은-설명>
   # git push -u origin refactor/<짧은-설명>
   # gh pr create --base main --title "refactor(core): <한 줄 요약>" --body "스냅샷 변경 포함. 리뷰 후 머지."
   ```

   커밋 메시지는 `commit-rules.md` 형식 (refactor(core): …).

5. **응답**  
   위까지 처리한 뒤 `HEARTBEAT_OK` 또는 이번 턴 요약을 보내세요.

---

## 하지 말 것

- 빌드/테스트 실패한 상태에서 커밋·푸시하지 않기.
- 스냅샷 회귀가 있으면 그대로 커밋하지 말고 원복 후 턴 종료.
- **코드 변경으로 스냅샷이 바뀐 경우** main에 직접 푸시하지 말고, 브랜치 푸시 후 PR로 올리기.

---

## 리팩터 후보

할 일이 없을 때 아래에서 **한 턴에 하나** 골라 진행. 끝난 항목은 목록에서 제거해 두기.

- **Clippy 경고 제거**: `cargo clippy -p hwp-core -- -W clippy::all` 로 확인 후, `doc_lazy_continuation`(doc 들여쓰기), `useless_conversion`(`.map_err(HwpError::from)?` → `?`), `redundant_closure` 등 수정. `cargo clippy --fix --lib -p hwp-core` 로 자동 수정 가능한 것부터 적용.
- **`#[allow(dead_code)]` 정리**: `table.rs`, `line_segment.rs`, `border_fill.rs`, `ctrl_header/caption.rs` 등 — 해당 코드 사용처 추가 또는 미사용 코드 제거 후 allow 제거.
- **긴 함수 분리**: `bodytext/mod.rs`의 `parse_record_from_tree` 등 100줄 넘는 match/블록은 태그별로 헬퍼 함수로 쪼개기.
- **중복 로직 추출**: 파싱/렌더링에서 반복되는 패턴을 공통 함수나 모듈로 묶기.
- **명세 정합성**: 스펙 문서(`docs/docs/spec/`, `.cursor/skills/hwp-spec/`)와 필드명·주석·자료형 맞추기.
- **TODO 주석 정리**: `viewer/core`, `viewer/html/ctrl_header` 등에 있는 TODO를 백로그(`docs/docs/backlog/`) 항목과 연결하거나 주석 보강.

---

## 참고

- 스냅샷 경로: `crates/hwp-core/tests/snapshots/`
- 스냅샷 검토(accept/reject): `cargo insta review -p hwp-core`
- 명세/가이드: `AGENTS.md`, `docs/docs/spec/`, `.cursor/skills/hwp-spec/`
