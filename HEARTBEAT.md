# Heartbeat — hwp/core 리팩터 머신 (5분 주기)

이 파일을 읽고 아래 지시대로 **한 턴**에 수행하세요.  
할 일이 없으면 `HEARTBEAT_OK` 만 답하세요.

**대상:** 이 워크스페이스 **hwpjs** — 특히 **crates/hwp-core** 리팩터링.

---

## 매 턴 순서

1. **리팩터 작업 1개**  
   `crates/hwp-core` 안에서 한 가지 리팩터를 진행 (가독성, 구조 정리, 명세 정합성 등).  
   변경 범위는 작게 유지.

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
   스냅샷이 바뀌면 `cargo test -p hwp-core` 로 인해 insta가 스냅샷을 갱신할 수 있음 — **의도한 개선**이면 그대로 두고, **회귀**면 원복 후 종료.

4. **커밋 및 푸시 (조건 충족 시에만)**  
   - 빌드·테스트 통과  
   - 스냅샷: 변화 없음 또는 의도한 개선만 있음  
   → **무조건 main에 커밋 및 푸시** 진행.

   ```bash
   git -C /Users/yoonhb/Documents/workspace/hwpjs status
   # 변경 있으면:
   git -C /Users/yoonhb/Documents/workspace/hwpjs add -A
   git -C /Users/yoonhb/Documents/workspace/hwpjs commit -m "refactor(core): <한 줄 요약>"
   git -C /Users/yoonhb/Documents/workspace/hwpjs push origin main
   ```

   커밋 메시지는 `commit-rules.md` 형식 (refactor(core): …).

5. **응답**  
   위까지 처리한 뒤 `HEARTBEAT_OK` 또는 이번 턴 요약을 보내세요.

---

## 하지 말 것

- 빌드/테스트 실패한 상태에서 커밋·푸시하지 않기.
- 스냅샷 회귀가 있으면 그대로 커밋하지 말고 원복 후 턴 종료.

---

## 참고

- 스냅샷 경로: `crates/hwp-core/tests/snapshots/`
- 명세/가이드: `AGENTS.md`, `docs/docs/spec/`, `.cursor/skills/hwp-spec/`
