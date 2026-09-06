# HWP5 변경 추적 내용·정보

[DocInfo 계약](hwp5-docinfo-contracts.md) · [작성자](hwp5-track-authors.md)

## 명세와 범위

명세 근거는 `legacy/rust/.claude/skills/hwp-spec/`의 다음 세 문서입니다.

- `3-2-2-문서-정보.md` 표 4: 변경 추적 정보는 1,032바이트·레벨 1, 변경 추적 내용 및 모양은 가변 길이·레벨 1입니다.
- `4-2-문서-정보의-데이터-레코드.md` 표 13: 정보 `HWPTAG_BEGIN+16`은 태그 32, 내용 `HWPTAG_BEGIN+80`은 태그 96입니다. 두 이름을 혼동하지 않습니다.
- `4-2-2-아이디-매핑-헤더.md` 표 16: 슬롯 16은 변경 추적 개수입니다(5.0.3.2 이상).

이번 구현은 레코드 경계와 개수 검증입니다. payload의 필드 의미를 해석한 것은 아닙니다. 두 레코드는 계속 `Value.unknown`이며 참조 보고서의 `unknown_records`에도 남습니다.

## 책임 분리와 보존

`docinfo/track_change_info.zig`의 `View.parse()`는 표 4의 1,032바이트 코어와 후속 extra를 나눠 빌립니다. 짧으면 `UnexpectedEnd`이고, 긴 입력은 잘라 버리지 않습니다. extra 허용은 향후 확장의 원문 보존 정책이며 추가 필드가 명세에 정의되었다는 주장이 아닙니다. 코어의 첫 DWORD를 56으로 보정하거나 나머지 바이트를 0으로 만들지 않습니다.

`docinfo/reader.zig`는 태그와 레벨의 단일 출처입니다. 정보 레코드의 경계 검사를 호출하고, 내용·정보·작성자는 공통 unknown 분기의 레벨 1 검사로 연결합니다. 실패 시 iterator 위치는 유지됩니다. 레벨과 길이가 동시에 틀린 정보 레코드는 먼저 수행하는 payload 검사에서 실패할 수 있습니다.

`docinfo/resources.zig`는 태그 96의 실제 개수 `track_change_count`를 집계합니다. 슬롯 16이 실제로 존재하는 경우만 기존 `validateOptionalCount()`로 비교합니다. 부재(null)와 0을 구분하고 음수는 `NegativeMappingCount`, 불일치는 `ResourceCountMismatch`입니다. 버전상 기대 슬롯 수로 실제 슬롯을 보충하지 않으며 선언 개수로 할당하지 않습니다. 태그 32는 내용 개수에 포함하지 않습니다.

개수 검사는 기존 참조·decoded 문서·CFB 문서 경로의 `validateKnownCounts()`를 통해 전파됩니다. BinData/글꼴 전용 `validate()`는 범위를 유지합니다. 이 뷰는 입력 수명을 따르며 문서 모델·편집·저장 API를 제공하지 않습니다.

## 레거시·rhwp 비교

레거시 `legacy/rust/crates/hwp-core/src/document/docinfo/track_change.rs`는 길이 1,032 미만을 거부하지만 앞 1,032바이트만 복사하므로 뒤의 바이트는 반환하지 않습니다. `track_change_content.rs`는 미해석 payload 전체를 복사합니다. 신규 코어는 할당 없이 코어·extra를 모두 빌리고 기존 framing도 전체를 보존합니다.

rhwp `reference/rhwp/src/serializer/hwpx/header.rs`의 `track_change_flags()`는 태그 32의 첫 DWORD를 HWPX `trackchageConfig`의 flags로 출력하고 레코드 부재/4바이트 미만이면 56을 사용합니다. `parser/hwpx/header.rs`는 첫 DWORD 56인 1,032바이트 레코드를 생성합니다. 이는 참조 구현의 변환 정책이며, 우리 HWP 입력 검증에서 잘림을 기본값으로 바꾸거나 미확정 비트 의미를 추측할 근거로 사용하지 않습니다.

추가 읽기 전용 대조에서 `pr-1674.hwp` ↔ `hwpx/pr-1674.hwpx`, `task1749/saved_bounds_cumulative_page_break.hwp/.hwpx`, `task1749/saved_bounds_cumulative_vpos.hwp/.hwpx` 세 쌍은 첫 DWORD와 XML flags가 모두 56으로 일치했습니다. 이 세 쌍은 값 60이나 각 비트 의미의 대응까지 증명하지 않습니다. 제품 HWPX 파서나 flags 변환 API는 아직 추가하지 않았습니다.

## 실제 표본과 적대적 검증

`reference/rhwp/samples`의 `.hwp` 경로 536개 중 조사 가능한 DocInfo 430개에서 다음을 관측했습니다. CFB/스트림 접근 실패와 암호화·배포용 제외 106개는 조사 범위 밖입니다. Node 압축 해제와 JS 레코드 순회로 측정한 결과이며 전체 문서 기능 검증과 구분합니다.

| 항목 | 결과 |
|---|---|
| 정보 태그 32 | 282개, 모두 레벨 1·1,032바이트 |
| 첫 DWORD 원값 | 56이 279개, 60이 3개(의미를 확정하지 않음) |
| 내용 태그 96 | 230개, 모두 레벨 1 |
| 내용 payload 길이 | 26바이트 168개, 30바이트 62개 |
| 슬롯 16 | 부재 147개, 존재하는 283개에서는 개수 불일치 0건 |

내용 레코드는 `issue5169_viewtext_changetracking.hwp` 229개와 `task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp` 1개입니다. 이 두 원본을 JS 회귀 테스트에서도 읽습니다.

`src/hwp5/docinfo/track_change_tests.zig`는 모든 짧은 코어 길이 0~1,031, borrowed 포인터와 홀수 extra, 앞 레코드를 소비한 뒤 오류 재호출의 원자성, 슬롯 유무와 음수·최댓값을 검사합니다.

`tests/hwp5/track-change.mjs`는 네 버전·일반/확장 헤더에 대해 원문 전체 반환, 잘못된 레벨, 모든 짧은 정보 payload를 검사합니다. 내용 payload는 배치 미확정 상태이므로 0/1/26/30바이트를 미해석으로 전달합니다. 이를 내용 필드의 유효성 검증으로 해석하지 않습니다.

실제 문서에서는 슬롯 개수 변조, 내용 레코드 삭제·중복, 두 태그의 잘못된 레벨, 정보 payload 잘림을 참조·decoded 문서·재압축 CFB 문서의 세 경로에서 거부하는지 확인합니다. 첫 DWORD 0/56/60/UINT32_MAX와 홀수 extra는 보정 없이 허용하며 오류/변형 뒤 원본 재처리도 비교합니다. 디스크 표본은 변경하지 않습니다.

별도 Debug WASM 인스턴스에서 변경 추적 전용 테스트를 실행해 합성 정상 64건·거부 8,440건, 실제 문서 변조 정상 4건·세 경로 합계 거부 51건을 확인했습니다. 정상 원본 재처리와 원문 바이트 비교도 포함합니다. 전체 감사는 [개발·검증 명령](development-commands.md#세-빌드-모드-회귀-검증)의 순차 실행을 따릅니다.

Debug → ReleaseSafe → ReleaseFast 전체 감사가 모두 성공했습니다. 각 모드에서 네이티브 258/258, Node 47/47, HWP5 WASM 검사 1,381,068회를 통과했습니다. CFB 변형 12,000건의 trap은 0이었습니다. Zig 포맷·변경 JS 구문·diff 공백과 주제 문서 링크도 검사했습니다. 실행 로그는 `/tmp/hwpjs-track-change-{debug,safe,fast}.log`입니다. 이 횟수는 변경 추적 필드 의미나 전체 문서 구현의 완성도를 뜻하지 않습니다.

## 남은 범위

[payload·ViewText 조사](hwp5-track-change-viewtext.md)에 공개 답변, 실제 스트림 차이, 손상 ViewText가 현재 검사되지 않는 재현 결과와 다음 구현 순서를 기록했습니다.

내용/작성자 payload 필드, 작성자 ID와 내용 참조, 변경 이력의 적용·취소, 편집·저장·HWPX 변환은 미완료입니다. 정보 코어 경계와 매핑 개수를 검증했다고 변경 추적 전체 지원으로 표시하지 않습니다.
