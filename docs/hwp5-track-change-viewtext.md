# 변경 추적 ViewText 경계 검증·payload 조사

[내용·정보 계약](hwp5-track-changes.md) · [작성자 계약](hwp5-track-authors.md) · [컨테이너 계약](hwp5-document-contracts.md)

이 문서는 ViewText의 압축·framing·구역 경계 검증과 아직 미완료인 의미 검증을 구분합니다. 전체 변경 추적 필드 해석을 구현 완료한 문서가 아닙니다.

## 공개 답변으로 확인한 역할

[한컴 디벨로퍼 포럼의 2024년 답변](https://forum.developer.hancom.com/t/hwp-binary-format/1963)은 태그 32에 변경 추적 상태·암호 정보, 태그 96에 유형·시간·글자/문단 모양 ID, 태그 97에 검토자 정보가 들어간다고 설명합니다. 하지만 필드별 바이트 오프셋·길이·참조 기준은 제공하지 않습니다.

같은 답변은 변경 추적 내용을 ViewText에서 확인하고 BodyText는 하위 버전 호환용 최종본으로 설명합니다. 이후 해당 질문자의 파일은 BodyText에 내용이 반복된 손상 사례로 판정했습니다. 따라서 모든 BodyText가 정상 최종본이라는 보장이나 반복 본문을 임의 제거할 근거로 읽지 않습니다.

## 현재 코드의 검증 경계

`src/hwp5/container/sections.zig`는 BodyText와 ViewText의 직접 Section 자식에 같은 bounded decode를 제공합니다. BodyText는 기존 문서 의미 검사기로 보내고, ViewText는 `container/view_text.zig`에서 별도 framing 검사를 수행합니다. 기본 경로에서 실행하며 압축 실패를 BodyText나 원시 바이트로 대체하지 않습니다.

ViewText가 있으면 변경 추적 플래그와 무관하게 검사합니다. 지원하는 컨테이너 계약상 변경 추적 플래그가 있는데 ViewText가 없으면 `MissingViewText`입니다. 저장소 종류, Section 이름, DocInfo/BodyText와 같은 구역 수, 연속 인덱스, 비어 있지 않은 구역을 확인합니다. 이 지원 계약을 모든 미관측 버전의 완전한 명세라고 주장하지 않습니다. 배포용·암호화/DRM 지원 정책은 기존 `stream.requireSupported`가 계속 소유합니다.

`document/section_order.zig`는 BodyText와 ViewText의 인덱스 정렬·중복/범위 검사 단일 출처입니다. 배열은 선언값이 아닌 이미 공급된 구역 수로 할당합니다. 압축 해제는 공통 `stream.decode`, 레코드 경계는 `record.Iterator`, Section 이름은 `container/paths.zig`를 재사용합니다.

ViewText 해제 바이트는 `max_total_bytes`의 공유 예산을 소비하며 DocInfo/BodyText에서 사용한 뒤 남은 `max_total_records` 안에서 검사합니다. 구역마다 전체 레코드 예산을 다시 부여하지 않습니다. 실패 시 전체 컨테이너 검증을 종료하고 문서 보고서·임시 해제 버퍼·구역 순서 배열을 정리합니다. 성공 보고서는 ViewText 원문 포인터를 남기지 않습니다.

`Report.view_text`는 declared/present, sections, records, decoded_bytes, deferred_records를 제공합니다. 모든 ViewText 레코드는 아직 의미 검증 전이므로 deferred_records는 records와 같습니다. framing을 검사한 스트림은 uninspected_streams에서 빠지지만, 이를 payload 검증 완료로 해석하지 않습니다. 기존 BodyText 보고서와 섞지 않으며 총 decode 바이트에는 ViewText를 포함합니다. 테스트 mode 98은 위 여섯 값을 반환하고 mode 25도 같은 기본 검증을 수행합니다.

## 수정 전 누락 재현

연결 전 ReleaseFast 테스트 bridge(mode 25)로 `issue5169_viewtext_changetracking.hwp` 원본의 보고서를 얻은 뒤, CFB writer로 **메모리 안에서만** `/ViewText/Section0` 내용을 한 바이트 `ff`로 교체했습니다. 당시에는 변경 CFB도 검증에 성공하고 원본과 보고서 바이트가 같았습니다. 현재 테스트는 이 변형을 mode 25/98 모두 거부하도록 검사합니다.

## 실제 두 문서의 스트림 차이

두 파일의 FileHeader flags는 모두 16,385(압축 + 변경 추적)입니다. 배포용 플래그는 없으며 ViewText도 Node raw DEFLATE 해제와 일반 HWP 레코드 framing 순회를 통과했습니다. 배포용 ViewText에도 이 절차를 그대로 적용할 수 있다는 증거는 아닙니다.

| 표본·스트림 | decoded 바이트 | 레코드 | 문단 헤더 | PARA_TEXT 바이트 |
|---|---:|---:|---:|---:|
| issue5169 BodyText/Section0 | 24,344 | 775 | 228 | 7,080 |
| issue5169 ViewText/Section0 | 105,182 | 2,814 | 590 | 20,420 |
| task2070 BodyText/Section0 | 5,838,134 | 212,001 | 53,448 | 809,368 |
| task2070 ViewText/Section0 | 8,015,903 | 265,451 | 53,448 | 809,400 |

task2070의 전체 파일명은 `task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp`입니다. 문단 수가 같아도 레코드와 텍스트 바이트는 다르므로 스트림을 같은 본문으로 간주하거나 합쳐서 검증하지 않습니다. 위 수치는 framing 통계이지 문단·필드 의미 규칙의 성공 판정이 아닙니다.

430개 읽기 가능한 컨테이너의 추가 조사에서 플래그와 ViewText가 모두 없는 것은 427개, 모두 있는 것은 위 2개였습니다. `20250130-hongbo.hwp`는 플래그가 꺼져 있어도 ViewText/Section0이 있습니다. 따라서 플래그만으로 존재하는 스트림의 검사를 생략하지 않습니다.

`20250130-hongbo.hwp`의 ViewText는 처음에는 `InvalidDeflate`로 거부되었습니다. 이후 태그 28·256바이트 배포 데이터와 AES 블록·꼬리를 확인하고 [배포용 형태 ViewText 디코더](hwp5-distribution-viewtext.md)를 연결했습니다. 현재는 이 파일도 컨테이너 검증을 통과하며 복호화된 ViewText가 BodyText와 바이트 단위로 같습니다. FileHeader의 배포용 비트는 꺼져 있습니다. 배포용 비트가 켜진 문서 전체의 지원 정책과 구분합니다.

task2070을 전체 컨테이너 mode 98로 검사하면 기존 BodyText 의미 검사에서 `ControlIdMismatch`로 먼저 실패합니다. 이 파일의 ViewText 수치는 독립 framing 조사 결과이지 신규 컨테이너 경로의 전체 성공 증거가 아닙니다. issue5169는 실제 컨테이너 검증 및 변조 테스트를 통과한 표본입니다.

기존 decoded 문서 의미 검사기에 두 ViewText를 직접 공급하면 각각 `InvalidLinePosition`, `ControlIdMismatch`가 발생했습니다. 이를 피하려고 기존 BodyText 규칙을 완화하지 않았습니다. 다음 단계는 이 차이의 원인과 ViewText 전용 규칙의 근거를 조사하는 것입니다.

## payload 해석 근거의 한계

작성자 5개는 DWORD 길이 뒤 UTF-16 문자열로 읽었을 때 코드 유닛 수가 3/3/4/4/6이고 모두 8바이트가 남습니다. 관측 문자열은 작성자 이름처럼 보이지만 이 표본만으로 모든 버전의 명세 배치, 뒤 두 DWORD의 의미, 작성자 ID 기준을 확정하지 않습니다. 특히 남은 값을 색상이나 식별자로 자동 해석하지 않습니다.

HWPX 확장자 경로 439개 중 테스트 추출기로 헤더를 읽은 433개에서는 직접 대조할 작성자/변경 항목을 찾지 못했습니다. 추출 실패 6개는 검사한 것으로 세지 않으며 스크립트 결과에 파일명을 남깁니다. 조사 도구는 XML 태그 이름만 확인하며 config-item의 `TrackChangePasswordInfo` 문자열을 작성자 요소로 잘못 집계하지 않습니다. 이름 검색은 완전한 스키마 검증이나 문서 전체 변경 추적 부재의 증거가 아닙니다.

읽기 전용 통계 재현:

```sh
node tests/hwp5/track-change-survey.mjs zig-out/bin/hwpjs.wasm
```

스크립트는 CFB 제품 reader, Node 압축 해제, 독립 레코드 순회와 기존 테스트용 ZIP/XML 추출기를 사용합니다. 제품 HWPX 파서를 추가하지 않으며 파일·표본을 수정하지 않습니다.

최초 조사에서는 제품 코드 변경 없이 통계를 확인했습니다. 이후 경계 검증 연결의 회귀 검사는 아래와 구분합니다.

## 경계 검증의 적대적 테스트

`src/hwp5/container/view_text_tests.zig`는 성공·늦은 framing 실패의 모든 할당 실패, 플래그와 저장소 존재의 구분, 바이트/레코드 정확한 한도와 한 단위 부족을 검사합니다. 두 ViewText 구역의 누적 레코드 한도와 두 번째 구역에서 발생한 실패의 정리도 확인합니다.

`tests/hwp5/view-text.mjs`는 실제 issue5169의 2,814레코드/105,182바이트 보고서를 독립 framing 결과와 대조합니다. 잘못된 압축, 빈 구역, 잘린 일반/확장 헤더·payload, 최대 길이, 저장소 누락, 이름/인덱스 오류, 추가 구역, 플래그 해제, 정확한 공유 한도를 검사합니다. 매 변형 후 같은 인스턴스에서 원본 결과로 복구하는지도 확인합니다. 임의 unknown 레코드가 framing은 통과하되 전부 deferred로 보고되는 경계도 검사합니다. 스냅샷이나 디스크 표본은 변경하지 않습니다.

Debug/ReleaseSafe/ReleaseFast 순차 전체 audit는 모두 성공했으며 각 모드에서 Node 47/47, WASM 1,381,128회를 통과했습니다. Debug 전체 감사의 네이티브는 260/260이었고, 다구역 테스트 추가 후 최종 Debug 네이티브 재실행 및 Safe/Fast 전체 감사에서 261/261을 확인했습니다. ViewText 전용 실제 문서 테스트는 정상 4건·거부 24건이며 오류 후 원본 복구를 별도 포함합니다. 포맷·JS 구문·문서 링크·diff 검사도 통과했습니다. 로그는 `/tmp/hwpjs-view-text-{debug,safe,fast}.log`, `/tmp/hwpjs-view-text-final-native-debug.log`입니다. 전체 감사의 성공은 위에서 명시한 미지원 실파일이나 deferred 의미 검증의 성공을 뜻하지 않습니다.

## 다음 구현 순서와 완료 조건

1. `InvalidLinePosition`/`ControlIdMismatch`의 실제 위치·원인과 ViewText 표현 차이를 확인합니다.
2. 변경 추적 필드·범위와 DocInfo의 내용·작성자 참조를 연결합니다. BodyText의 규칙을 검증 없이 그대로 적용하지 않습니다.
3. 범위·참조 손상을 실제 ViewText 변조로 검사하고 deferred 감소의 근거를 남깁니다.
4. 배포용 형태 디코더가 지원하지 않는 꼬리 형식과 배포용 문서 전체의 스트림 선택 정책을 확인합니다. 압축 실패를 원문이나 BodyText로 자동 대체하지 않습니다.

위 경로가 검증되기 전까지 전체 변경 추적 검증은 미완료입니다. 현재의 작은 표본만으로 payload 필드를 확정하는 작업보다 이 누락을 우선합니다.
