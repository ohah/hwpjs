# hwp-core 생성 문서 이미지 스냅샷

**대상**: `crates/hwp-core/tests/snapshots/`에 있는, hwp-core가 생성한 HTML/마크다운 파일을 브라우저로 렌더링한 뒤 이미지 스냅샷으로 저장·비교합니다. (예제 앱이 아님)

- **실행**: `bun run test:doc-snapshots` (루트) 또는 `bun run test:e2e` (이 디렉터리)
- **스냅샷 갱신**: `bun run test:e2e -- -u`
- **HTML**: 정적 서버로 `snapshots/*.html` 제공 후 풀페이지 스크린샷
- **마크다운**: `snapshots/*.md`를 읽어 `marked`로 HTML 변환 후 `setContent`로 렌더링하고 풀페이지 스크린샷
