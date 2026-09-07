# ICC 등록부 조회 계약

[식별자 스냅샷](icc-registry.md)에서 만든 Zig 테이블을 조회합니다. 네트워크·파일·할당자·호스트 시간에 의존하지 않습니다. 표에 속하는지와 전체 ICC 유효성은 구분합니다.

## SSOT와 상태

`registry/source.json`이 추출 사실과 불확실성의 단일 출처입니다. `tools/icc-registry/generate.mjs`가 검증 후 `registry/data.zig` 내용을 표준 출력으로 생성합니다. `--check`는 저장된 생성 파일과 정확히 비교하며 자동 덮어쓰지 않습니다. 빌드의 네이티브 테스트·제품 WASM·테스트 WASM 컴파일은 이 검사에 의존합니다. 데이터의 snapshot_sha256은 JSON.stringify 결과의 SHA-256이며 원문 CSV 각각의 해시와 다릅니다.

`registry/lookup.zig`는 정렬된 u32 키 또는 제조사 상위32/장치 하위32의 u64 키를 이진 검색합니다. 임시 복사 없이 O(log n)이며 정렬/고유성은 생성 전 검증이 책임집니다. 공통 contains의 호출자는 정렬된 키를 제공해야 합니다. 공개 등록부 함수는 검증된 생성 테이블만 사용합니다.

| 상태 | 의미 |
|---|---|
| unspecified (0) | 헤더의 해당 ID가 0 |
| registered (1) | 스냅샷의 일치가 확인된 행에서 발견 |
| not_found_in_snapshot (2) | 문제 행 없이 추출한 스냅샷에서 미발견. 영구 미등록 판정은 아님 |
| unresolved_snapshot (3) | 미발견이지만 격리된 행이 있거나, 장치 ID는 있으나 제조사 ID가 0 |

현재 제조사/장치 목록에는 문제 행이 있으므로 일치 항목을 찾지 못하면 3을 반환합니다. 격리 ID의 hex/ASCII 어느 쪽도 정상 키로 자동 승격하지 않습니다. 추출에 성공한 별도 행의 등록 근거는 유지합니다. 장치 ID가 0이면 제조사 값과 관계없이 미지정이며, 장치가 비영이면 반드시 제조사와 묶어 조회합니다.

`header_registry.inspect(Header)`는 CMM·제조사·모델·작성자 상태 네 개를 반환합니다. 작성자는 제조사 표를 조회하지만 권고를 필수 오류로 승격하지 않습니다. 헤더 버전·식별자 종류·날짜·ID 해시·태그·색상 변환을 검사하지 않습니다. 기존 `header_identifiers`의 미대조 개수를 조용히 변경하지 않고 별도 결과를 제공합니다. 성공 개수에서 미확정 개수를 빼서 전체 유효성으로 취급하지 않습니다.

## 검증

최종 재검토에서 [분할 다운로드의 조각 메모리 문제](icc-registry.md#다운로드-조각-메모리-보강)를 수정했고 등록부 도구 테스트는 14/14 통과했습니다. 수정된 downloader로 공식 세 CSV를 다시 읽어 저장 스냅샷의 모든 필드와 deepEqual 대조했으며 일치했습니다(행 31/281/3071, 문제 0/3/44). 수정 후 Debug·ReleaseSafe·ReleaseFast 전체 감사는 각각 20/20 단계, 네이티브 422/422, 등록부 도구 14/14, HWP 감사 프로그램 검사 4,413,054건으로 통과했습니다. 최종 실행 로그는 로컬 `/tmp/hwpjs-icc-registry-Debug-final.log`, `/tmp/hwpjs-icc-registry-ReleaseSafe-final.log`, `/tmp/hwpjs-icc-registry-ReleaseFast-final.log`입니다. 검사 건수는 반복·변형 검사를 포함하며 실제 문서 수나 전체 포맷 지원률이 아닙니다.

2026-09-07 `zig build icc-registry-audit --summary all` 3/3 단계, Node 테스트 13/13 통과를 확인했습니다. 생성 Zig의 모든 키를 독립적인 16진수 문자열 분해로 원본 JSON의 정수/쌍과 비교했습니다. 스키마·불완전성·빈 테이블의 생성도 검사합니다. `zig build test --summary all`은 생성 파일 검사를 포함해 5/5 단계, 네이티브 422/422 통과입니다.

테스트용 mode 149는 정확히 128바이트 헤더를 받아 CMM/제조사/모델/작성자 상태 네 개 u32 LE를 반환합니다. limit은 입력 전체 한도입니다. `tests/hwp5/icc-registry.mjs`는 생성 Zig가 아닌 source.json에서 독립 Set을 만들고 전체 등록 항목·키 앞뒤 값·부모 부재/변형·부호 경계·잘림·한도·오류 후 복구를 대조합니다. 정규 HWP5 audit에 연결했습니다.

`zig build hwp5-audit -Doptimize=ReleaseSafe --summary all`은 종료 코드 0, 8/8 단계, HWP 검사 4,413,054건, WASM import 0으로 통과했습니다. 신규 조회 비교 13,887건·손상 거부 130건이며 31개 CMM, 278개 제조사, 3,027개 장치 쌍 전체를 포함합니다. 로컬 임시 로그는 `/tmp/hwpjs-icc-registry-wasm.log`입니다. 당시 변경 JS 11개 문법과 관련 문서 로컬 링크 9개도 통과했습니다. 이후 전체 세 모드 감사 결과는 위 최종 기록을 따릅니다. 제품 JS API 연결, 프로파일 종류별 필수 태그·타입 의미 검증, PNG 픽셀 경로 연결과 색상 변환은 아직 미완료입니다.

## 공식 파일의 수동 헤더 대조

후속 의미 검증의 명세 대조와 미완료 항목은 [필수 태그 검증 작업](icc-required-tags.md)에 분리합니다.

2026-09-07 [기존 공식 ICC 파일 URL 네 개](icc-verification.md#공식-외부-파일-비교)를 다시 메모리로 읽어 mode 149를 독립 Set 기준과 대조했습니다. sRGB2014와 sRGB_v4_ICC_preference의 네 상태는 모두 0이었습니다. displayclass 파일의 네 필드는 실제로 비영 `none`(6e6f6e65)이었으며 결과는 `2,3,3,3`입니다. 이를 미지정 0으로 보정하지 않습니다. added-bytes의 CMM/제조사/모델/작성자는 ADBE/none/0/ADBE이고 결과는 `1,3,0,1`입니다. 모든 보고서가 독립 기준과 일치했습니다. 수동 비교는 자동 감사 수에 합산하지 않으며 파일 전체나 색상 출력의 유효성 검사가 아닙니다.
