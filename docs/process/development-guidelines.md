# 개발 가이드라인

## 코드 스타일

- **Rust**: `rustfmt`, `clippy`
- **JavaScript/TypeScript**: `oxlint`, `oxfmt`
- 저장 시 자동 포맷팅

## 함수 파라미터 설계 (hwp-core)

- **전체 구조체 전달**: ID 기반 조회 많을 때, 런타임에 필드 결정될 때, 확장 가능성 높을 때
- **구조체로 묶기**: 파라미터 7개 이상, 필드 명확·고정, 테스트 용이성
- **하이브리드 권장**: `document`/`paragraph`는 전체 전달, 명확한 필드는 구조체로 묶기. 개발 단계에서는 전체 전달 허용, 안정화 후 리팩토링

## HWP 자료형 (hwp-core 필수)

- 스펙 "표 1: 자료형"을 `crates/hwp-core/src/types.rs`에 명시적으로 정의
- 기본 타입은 `type` 별칭, 도메인 타입(`HWPUNIT`, `COLORREF` 등)은 구조체 + 메서드
- 스펙 용어 그대로 사용 (DWORD, HWPUNIT, COLORREF)

## 테스트 (hwp-core 필수)

- 단위 테스트·스냅샷 테스트 작성
- fixtures: `crates/hwp-core/tests/fixtures/`, snapshots: `crates/hwp-core/tests/snapshots/`
- `common::find_fixture_file()` 사용
- **명령어**: `bun run test:rust`, `bun run test:rust-core`, `bun run test:rust:snapshot`, `bun run test:rust:snapshot:review`

### 스냅샷 HTML 로컬에서 보기

테스트로 생성된 HTML 스냅샷을 브라우저에서 보려면 로컬 웹서버를 띄웁니다.

```bash
# 기본 포트 11300
bun run serve:snapshots

# 또는 포트 지정
bash scripts/serve-snapshots.sh 9876
```

접속 URL 형식: **http://localhost:11300/snapshots/파일명.html** (예: http://localhost:11300/snapshots/noori.html).  
서버는 `crates/hwp-core/tests/` 를 루트로 제공하므로 목록은 http://localhost:11300/snapshots/ 에서 확인할 수 있습니다.

### HTML 뷰어 테스트 규칙

- 원본 스냅샷: `fixtures/*.html` (기준). `<link>` → `<style>` 대체, 나머지 동일 유지
- JSON 스냅샷 참조 필수. 스펙·JSON·원본 HTML에서만 값 유도, 임의 상수 금지
- 스냅샷 비교: `*.html.snap`, `cargo insta review`

## 빌드·린트

- **빌드**: `bun run build`
- **린트**: `bun run lint`
- **포맷**: `bun run format`

## 커밋 규칙

상세: 루트 [commit-rules.md](../../commit-rules.md). 요약: 단일 목적, 논리적 분리, `<type>(<scope>): <subject>` 형식.
