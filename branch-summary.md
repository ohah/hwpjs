# feat(core): PDF export tests, bundled fonts, and image handling

## Purpose

- PDF export 테스트가 폰트 없이도 동작하도록 Liberation Sans를 저장소에 포함
- 이미지 임베딩 안정화 (Base64 디코딩, 투명도 제거 후 RGB 변환)
- 스냅샷 실행 시 실제 PDF 파일을 스냅샷 디렉터리에 생성

## Work content

- **폰트 번들**: `tests/fixtures/fonts/`에 Liberation Sans TTF 4종(LiberationSans-Regular/Bold/Italic/BoldItalic) 및 LICENSE(SIL OFL 1.1), README 추가. `find_font_dir()`로 테스트에서 자동 사용.
- **이미지 처리**: BinData Base64 디코딩 시 공백/줄바꿈 무시(`decode_bindata_base64`), genpdf/printpdf 미지원 알파 채널 대응으로 `to_rgb8()` 후 RGB만 전달해 PDF 이미지 임베딩 안정화.
- **실제 PDF 출력**: `pdf_generated` 테스트 실행 시 `tests/snapshots/`에 `pdf_export__noori_pdf_generated.pdf`, `pdf_export__table_pdf_generated.pdf` 형식으로 저장.
- **테스트 정리**: PDF 메타데이터 비결정성으로 바이트 스냅샷 제거. `pdf_generated_*` 테스트는 유효 PDF 검사 및 파일 쓰기만 수행. content_summary 스냅샷 유지.
- **린트**: `collect_summary_records`의 `document` → `_document`, `find_font_dir`에 `#[allow(dead_code)]` 적용.

## How to test

- `bun run test:rust` (또는 `cargo test -p hwp-core --test pdf_export`) 실행 시 PDF export 테스트 통과.
- `crates/hwp-core/tests/snapshots/` 아래에 `pdf_export__table_pdf_generated.pdf` 등이 생성되는지 확인.

## Additional info

- noori 픽스처는 한글 포함으로 Liberation Sans만으로는 렌더 불가(genpdf UnsupportedEncoding). 해당 테스트는 패닉 시 스킵.
- 한글 문서 PDF는 한글 지원 폰트(예: Noto Sans KR)를 `font_dir`에 지정해 사용.
