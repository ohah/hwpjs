# 양식의 글자 모양 선택·선택 상태

[관측 스키마](hwp5-form-schema.md) · [문서 통합](hwp5-form-document.md)

## 근거와 경계

한컴의 [양식 개체 속성 도움말](https://help.hancom.com/hoffice130/ko-KR/Hwp/view/workwindow/workwindow%28attribute%29.htm)은 FollowContext가 꺼지면 지정한 CharShape를 유지하고 켜지면 주위 글자 모양을 따르는 것으로 설명합니다. 선택 상자·라디오 단추의 Value 0/1은 선택 해제/선택이며 TriState는 Value 2의 중간 상태를 허용합니다.

이 설명은 UI 의미의 근거이지 HWP5 내부 문자열의 전 버전 인코딩 명세가 아닙니다. 현재 관측 스키마에서 명시적으로 기록된 십진 0/1만 해당 불리언으로 해석합니다. 음수(-0 포함)나 다른 수를 nonzero=true로 해석하지 않습니다. 선행 0은 허용하며 원문은 바꾸지 않습니다. 누락된 속성의 기본값을 HWPML·HWPX나 rhwp 작성기로부터 가져오지 않습니다.

도움말은 주변 글자 모양의 정확한 선택 우선순위·문단 경계·변경 추적 좌표 규칙을 정의하지 않습니다. surrounding은 그 출처를 선택했다는 진단이며 특정 주변 CharShapeID를 해석한 결과가 아닙니다. Value 2와 꺼진 TriState의 조합은 이 선택 모델에서 invalid로 진단하며 파일 전체를 불법이라고 단정하거나 거부하지 않습니다.

## 책임과 API

`body/form_semantics.inspectObserved(tree, schema_report, kind, stored_reference)`가 조건 해석의 단일 출처입니다. 같은 변경되지 않은 Tree, 그 Tree와 kind로 얻은 스키마 보고서, 동일 문서 글자 모양 테이블로 검사한 저장 참조 결과를 전달합니다. 할당·원문 수정·주변 문단 검색은 하지 않습니다. 원시 문법, 경로/자료형, 저장 ID 변환은 기존 모듈에 남습니다.

| 결과 | 상태 |
|---|---|
| follow_context / tri_state | missing / off / on / unrecognized |
| char_source | undetermined / explicit / surrounding |
| active_reference | deferred / absent / valid / invalid |
| choice | not_applicable / deferred / unchecked / checked / indeterminate / invalid |

FollowContext=off에서만 저장 참조를 active_reference의 absent/valid/invalid로 연결합니다. 나머지는 deferred입니다. 알려지지 않은 타입의 속성은 스키마가 해석하지 않으므로 출처도 undetermined입니다.

choice는 check_box/radio_button만 대상입니다. Value 0/1은 TriState 누락 여부와 관계없이 해제/선택, Value 2는 TriState=on이면 indeterminate, off이면 invalid, missing/unrecognized이면 deferred입니다. 누락·음수·3 이상 Value는 deferred이며 임의로 unchecked로 치환하지 않습니다. 다른 타입은 not_applicable입니다.

음수/오버플로 CharShapeID는 기존 저장 참조 파서 오류를 그대로 전파합니다. FollowContext=on이라는 이유로 이 오류를 숨기지 않습니다. 반면 표현 가능한 범위 밖 ID는 저장-invalid로 남으면서도 surrounding 출처의 활성 참조 오류로 집계되지 않습니다. 주변 출처의 실제 참조 검증은 아직 남아 있습니다.

## 검증 구성

테스트 mode 111은 mode 108과 같은 입력(kind u32·글자 모양 수 u32·UTF-16 속성)을 받으며 위 표 순서의 enum ordinal 다섯 개를 u32로 출력합니다. 이는 테스트 전용 wire이며 제품 JS ABI 추가가 아닙니다. mode 108의 기존 출력은 변경하지 않습니다.

독립 JS oracle은 기존 독립 스키마 결과의 원본 문자열을 BigInt로 해석하고 조건을 대조합니다. 제품 규칙이나 serializer를 가져오지 않습니다. 여섯 종류 × FollowContext 아홉 값 × TriState 아홉 값 × Value 아홉 값 × 저장 ID 네 값의 교차 검사에 고정 기대값과 저장-ID 오류/복구를 추가합니다. 미지 하위 트리의 필드를 훔쳐 읽지 않는 경우도 포함합니다.

실파일 두 개의 선택 상자·라디오 단추 각각에서 FollowContext 다섯 값 × TriState 네 값을 변조하고 Value=2·실제 테이블 끝 ID를 함께 넣습니다. 저장-invalid와 활성-invalid의 분리, 주변/미정 출처, 중간/잘못된/미정 선택 상태를 고정 카운터와 전체 보고서로 대조합니다. decoded 문서와 재압축·재구성한 메모리 CFB의 선택/미선택 경로 모두 검사하며 원본 파일은 쓰지 않습니다.

네이티브 검사는 저장 ID의 부재/유효/범위 밖과 출처의 조합, 두 선택 종류 및 명령 단추, 미지/음수/큰 정수·선행 0을 확인합니다. 문서 통합의 기존 할당 실패 주입과 구역 전체 예산 검사도 계속 적용됩니다.

## 적대적 재검토

- 근거 범위: UI 설명을 HWP5 전체 wire 명세로 확대하지 않았습니다. 명시적 0/1 선택 모델과 아직 확인되지 않은 기본값·주변 선택 우선순위를 구분합니다.
- 조건 조합: 저장 ID가 범위 밖이면서 주변 출처인 경우와 지정 출처인 경우를 같은 오류로 집계하지 않습니다. 누락·미인식 TriState를 false로 대체하지 않습니다.
- SSOT: 초기 변경분에서 미지 타입의 undetermined 출처를 문서 집계 쪽에서도 직접 결정하던 분기를 제거했습니다. 알려진/미지 타입 모두 같은 조건 해석을 사용하고 집계기는 반환 상태만 셉니다. 저장 참조의 미지 타입 진단은 기존대로 별도 유지합니다.
- wire·문서 경계: forms 보고서는 24개 수치이며 독립 wire 계약 검사에서 두 번째 구역의 기존 필드 위치와 마지막 새 필드·범위 밖 접근도 검사합니다. 서로 다른 두 구역의 진단, 미선택 모드, 전역 예산 부족·할당 실패 후 정리 검사를 유지합니다.
- 실패 이력: 최초 새 테스트 생성기가 두 set 사이 구분 공백을 누락하여 독립 문법 oracle에서 실패했습니다. 생성기를 수정하고 최종 Debug 전체 실행을 새 로그로 분리했습니다. 실패한 `/tmp/hwpjs-form-semantics-debug.log`를 성공 기록으로 집계하지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast WASM에서 집중 검사를 각각 재실행해 조건 해석 정상 17,500건·저장-ID 오류 6건, 기존 스키마 정상 133건·거부 241건, 실파일 변조 80조합 및 기존 문서 통합 거부 32건의 같은 결과를 확인했습니다. 관측 계약 내에서 추가 결함은 발견하지 못했으며 원본 한글 프로그램의 렌더링과 동일하다는 검증은 아닙니다.

## 전체 회귀 실행 결과

2026-09-07 최종 소스와 테스트로 Debug → ReleaseSafe → ReleaseFast 전체 audit를 순차 실행했습니다. 모두 16/16 단계, 네이티브 292/292개, Node 47/47개, 조사 도구 22/22개가 통과했습니다. HWP5 probe 호출 계수는 각 모드 1,422,837이며 고유 기능 수나 전체 지원률이 아닙니다.

최종 로그는 `/tmp/hwpjs-form-semantics-debug-final.log`, `/tmp/hwpjs-form-semantics-safe.log`, `/tmp/hwpjs-form-semantics-fast.log`입니다. 집중 재검사한 probe 캐시 ID는 각각 `e8faa086d23bc12da2df97816a862481`, `bba2f5e19e4535aed854a94f6d2c7e8d`, `1be3baca691f0065515ed4ea2450347e`입니다. 임시 로그나 캐시 보관에 의존하지 않으며 새 조건 검사도 저장소의 audit에 포함됩니다.

## 남은 범위

주변 글자 모양의 정확한 해석, 다른 속성의 모든 값 범위·기본값·적용 조건, 리스트·이벤트·레이아웃·편집·저장, 다른 버전/비 BMP 원본 프로그램의 속성 길이 검증은 별도 작업입니다. 이 조건 해석으로 전체 양식이나 전체 HWP 지원 완료를 주장하지 않습니다.
