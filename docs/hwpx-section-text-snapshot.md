# HWPX section 텍스트 소유 스냅샷

`Document.readSectionTextSnapshot(allocator, options)`는 기존 [section 텍스트 이벤트](hwpx-section-text.md)를 그대로 소비합니다. ZIP·XML 선택과 문자 참조 해독·조건부 분기 정책을 새로 구현하지 않습니다. 결과는 spine 순서의 문단·run·`hp:t` 시작/끝, 정규화된 UTF-8 내용 조각, 인라인 시작/끝/빈 요소의 순서와 위치를 소유합니다. 이벤트의 `raw_tag`는 호출 중 빌린 원문 태그를 복사하므로 원본 `Document`와 ZIP 버퍼 해제 뒤에도 살아 있습니다. `text_end`에는 원문 닫는 태그가 없으며 시작 태그의 namespace 선언 맥락도 따로 조립하지 않습니다.

스냅샷은 `section_text.Report`를 함께 반환하지만 전체 XML 트리·표·도형·header·마스터페이지·BinData를 소유하지 않습니다. 기본 분기 정책은 두 switch 분기를 모두 관측하며, 명시적 `options.scan.text.branch_policy`로 선택 분기를 요청할 수 있습니다. `raw_tag`를 해석해 편집 모델이나 무손실 재저장으로 승격하지 않습니다. 표시용 공백/줄바꿈 합성, 필드 의미, 텍스트 외부 콘텐츠와 layout 적용도 하지 않습니다.

`options.storage.max_events` 기본 4,000,000은 이벤트 개수를, `max_owned_bytes` 기본 128 MiB는 복사한 태그와 UTF-8 내용의 길이 합계를 제한합니다. 두 한도는 배열의 실제 할당 용량까지 포함한 RSS 상한이 아닙니다. 원본 section XML·정규화 내용 한도는 기존 `options.scan`이 별도로 소유합니다. 실패 시 부분 스냅샷은 반환하지 않고 이미 복사한 버퍼를 모두 해제합니다. 성공 시 `Snapshot.deinit()`으로 스냅샷을 해제합니다.

합성 검사는 문자 참조와 빈 `hp:t`, 문단/run 경계, tab, 미지원 중첩 인라인 태그, 정확한 이벤트/복사 바이트 한도, 스캐너 한도와 전 할당 실패 경로를 검사합니다. 실제 `issue2527_empty_linesegs.hwpx`에서는 `hp:t` 5개·정규화 UTF-8 607바이트를 소유하고, 독립 Python `zipfile` + `ElementTree`의 `hp:t` 텍스트 연결 바이트와 SHA-256 `1d34e0d7c3ea9f23648e04763504fbe36da71eeeb6cbb774d5c0ea5d131ab530`까지 일치했습니다. 이는 그 한 파일의 텍스트 내용 대조이지 모든 HWPX 문서의 표시 순서나 편집 가능성을 증명하지 않습니다.

재현 명령은 [개발·검증 명령](development-commands.md)에 둡니다.

이번 연결의 최종 검증은 전용 Debug·ReleaseSafe·ReleaseFast 각 5/5, 기존 section 텍스트 포함 Debug 15/15, 실제 파일 ReleaseFast 1/1 및 Python 바이트 대조, 전체 Debug `zig build test --summary all` 5/5 단계·2,549/2,549 테스트, ReleaseSafe 제품 빌드 5/5 단계, 기존 CFB 비교 47/47입니다. CFB 비교는 이 스냅샷의 독립 의미 검증으로 계산하지 않습니다.
