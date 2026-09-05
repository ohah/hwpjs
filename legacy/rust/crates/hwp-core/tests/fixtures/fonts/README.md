# PDF 테스트용 폰트 (Liberation Sans)

**폰트는 저장소에 포함되어 있습니다.** 사용자가 따로 받을 필요 없이 `cargo test --test pdf_export` 로 PDF 테스트가 동작합니다.

- **출처**: [liberation-fonts](https://releases.pagure.org/liberation-fonts/liberation-fonts-ttf-2.00.1.tar.gz) (LiberationSans 4개만 복사)
- **라이선스**: SIL Open Font License 1.1 — `LICENSE` 파일 참고. 폰트만 사용·재배포 가능.

genpdf가 사용하는 파일명: `LiberationSans-Regular.ttf`, `LiberationSans-Bold.ttf`, `LiberationSans-Italic.ttf`, `LiberationSans-BoldItalic.ttf`.

**PDF 결과물을 이미지로 확인하려면**: `poppler` 설치 후 테스트 실행 시 첫 페이지가 PNG로 저장됨.  
macOS: `brew install poppler` → `cargo test --test pdf_export pdf_generated_table_snapshot` 실행 시 `tests/snapshots/pdf_export__table_pdf_generated-1.png` 생성.
