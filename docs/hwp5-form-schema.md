# 양식 속성의 관측 스키마·저장 참조

[속성 문법](hwp5-form-properties.md) · [양식 조립](hwp5-form-controls.md) · [토큰 연결](hwp5-form-links.md) · [MaxLength](hwp5-form-max-length.md)

## 근거와 지원 경계

공개 HWP5 명세는 양식 태그를 정의하지만 내부 속성의 모든 키·필수값·범위는 정의하지 않습니다. 명세 4.2.2/4.2.6의 ID 매핑·글자 모양 레코드와 실제 `form-01.hwp`·`form-02.hwp`의 양식 속성을 대조했습니다. 이 스키마는 HWP 5.0.3.0 표본에서 관측한 직접 경로와 wire 자료형에 대한 명시적 선택이며, 전체 버전의 공식 스키마라는 뜻이 아닙니다.

rhwp `e8800c8de`의 `src/serializer/control.rs::build_common_set`, `build_char_shape_set_for`, `build_type_set`도 같은 세 묶음과 자료형을 작성합니다. 반면 파서는 속성을 평탄화하여 일부 키를 모델에 적용하고 나머지를 문자열 맵에 저장합니다. 여기서는 다른 묶음의 같은 키를 합치거나 후행 값으로 덮어쓰지 않습니다. rhwp 작성기의 누락값 보충 정책은 채택하지 않았습니다.

## 책임과 API

- `form_schema_rules.zig`가 양식 종류·직접 경로·필드 식별자·기대 자료형의 단일 표를 소유합니다. 33개 필드 식별자와 34개 경로 규칙입니다. `Text`는 콤보박스와 편집 상자에서 서로 다른 묶음에 위치합니다.
- `form_schema.inspectObserved(tree, kind)`는 변경되지 않은 `form_property_tree.Tree.parseObservedUnits` 결과를 검사합니다. 반환 Report의 `fields`는 각 필드의 원본 노드 번호 또는 null이고, `get(tree, field)`로 원래 Property를 가져옵니다. `known_nodes`에는 인식된 묶음과 필드가, `deferred_nodes`에는 미인식 하위 트리의 모든 노드가 포함됩니다.
- `form_references.storedCharShapeObserved(tree, report, count)`는 같은 Tree/Report와 해당 문서의 글자 모양 개수를 받아 저장된 `CharShapeID`의 명시적 0-based 범위를 검사합니다. 범위/부재 결과 형식과 ID 계산은 기존 `docinfo/reference_rules.zig`를 공유합니다.
- UTF-16LE와 ASCII 키의 정확한 비교는 `form_property.equalsAscii`를 문법 파서와 규칙 표가 공유합니다. 대소문자 변환·공백 제거·서로게이트 교체를 하지 않습니다.

스키마·참조 검사 자체는 할당하지 않습니다. Report는 값과 노드 인덱스만 가지며 Tree/원본 문자열을 소유하지 않습니다. `get`과 참조 검사에는 같은 변경되지 않은 Tree를 사용해야 하고, Property의 문자열을 쓰는 동안 원본 바이트도 유지해야 합니다. 임의로 조작한 Tree/Report에 대한 복구 API는 아닙니다.

## 인식하는 경로

세부 키와 자료형의 코드상 기준은 규칙 표 한곳입니다. 공통 묶음은 `CommonSet`(이름·색·그룹·탭 순서·사용 여부 등), 글자 속성은 `CharShapeSet`(`CharShapeID`·`FollowContext`·`AutoSize`·`WordWrap`)입니다. 타입별 묶음은 버튼/체크박스/라디오 버튼의 `ButtonSet`, 콤보박스의 `ComboBoxSet`, 편집 상자의 `EditSet`입니다.

인식된 묶음은 루트의 set이어야 하고 필드는 그 직접 자식이어야 합니다. 미지 set 안의 같은 키나 루트에 놓인 `CharShapeID`를 대신 가져오지 않습니다. 양식 종류가 unknown이면 모든 노드를 deferred로 둡니다. 다른 종류에만 관측된 묶음/필드도 현재 종류에서는 deferred입니다. unknown 원문은 원래 Tree에 남으며 Report만으로 원문 전체를 대체하지 않습니다.

알려진 경로의 자료형이 다르면 `FormSchemaTypeMismatch`, 같은 알려진 묶음이 반복되면 `DuplicateFormSchemaSet`, 같은 알려진 필드가 반복되면 `DuplicateFormSchemaField`입니다. 이 오류는 모호한 단일 필드 뷰를 만들지 않기 위한 관측 스키마 계약입니다. 하위 문법 파서는 중복 원문을 계속 보존하며, 이를 전 버전에서 불법인 파일이라고 일반화하지 않습니다.

필수 묶음·필드는 강제하지 않습니다. 누락과 빈 문자열은 각각 null과 길이 0 Property로 구분합니다. `bool:2`, `int:-1`, 매우 큰 정수도 wire 자료형 검사의 성공만으로 true/false·u32·enum으로 정규화하지 않습니다. 숫자 범위·불리언 의미·타입별 기본값·키의 적용 조건은 별도 검증 대상입니다.

## CharShapeID의 저장 범위 검사

인식된 `CharShapeSet/CharShapeID`가 없으면 absent입니다. 있으면 원래 십진 문자열을 u32로 변환합니다. 음수 표기(`-0` 포함)는 `InvalidFormCharShapeId`, u32 초과는 `FormCharShapeIdOverflow`이며, 플랫폼 주소 크기에 따라 의미가 달라지지 않습니다. 선행 0은 수치 계산에서 허용하되 원문 표기는 보존합니다.

0은 첫 글자 모양을 참조하며 부재 값으로 취급하지 않습니다. `id < count`이면 ordinal, 그 외에는 invalid라는 진단을 반환합니다. 범위 밖이라고 다른 글자 모양으로 대체하지 않습니다. `0xffffffff`에 상속/부재 의미를 임의로 부여하지 않습니다. count는 같은 문서의 실제 글자 모양 테이블 개수여야 하며, 문서 조립 시 기존 리소스 개수 검증도 필요합니다.

이 함수는 **저장된 ID의 범위**만 검사합니다. `FollowContext`에 따른 출처 선택은 별도 [조건 해석](hwp5-form-semantics.md)이 소유하며 다른 버전의 sentinel이나 주변 글자 모양 선택 규칙은 추정하지 않습니다. 기본 문서 검증에 자동 적용하지 않았으며 invalid 진단을 활성 참조 오류로 자동 승격하지 않습니다.

## 실파일·적대적 검증

테스트 mode 108은 kind u32·글자 모양 수 u32 뒤의 UTF-16 속성을 받고, known/deferred 수·참조 상태/ordinal·33개 필드의 노드 인덱스를 반환합니다. 기존 독립 `formPropertyEvidence`를 이용한 JS 경로/자료형 표와 결과 전체를 대조합니다. 제품 규칙 표나 serializer에서 기대값을 생성하지 않습니다.

합성 정상 133건·거부 241건은 다섯 종류의 알려진 경로 각각의 성공·자료형 변조·중복, 묶음의 자료형/중복, 미지 묶음의 내부 필드 탈취 방지, 다른 종류의 필드, 키 대소문자 차이, 원시 비 BMP/고립 서로게이트·NUL, 음수 bool 보존, `__proto__`/`constructor` 키, 누락·0·경계 밖 ID·u32 최댓값·오버플로·선행 0을 포함합니다. JS oracle도 상속 프로퍼티를 알려진 묶음으로 오인하지 않도록 own-property 검사를 합니다.

두 실파일은 각각 양식 5개·속성 노드 118개(묶음 15개+필드 103개), 실제 DocInfo 글자 모양 7개입니다. 모든 양식의 저장 CharShapeID 0이 ordinal 0으로 해석됩니다. 필드 103개의 자료형을 각각 변조해 거부하고 매번 원본을 재검사합니다. ID를 실제 개수인 7로 변조하면 invalid이며, 선두 미지 트리 안에 음수 CharShapeID를 넣어도 실제 경로를 대신 사용하지 않습니다. 디스크 표본은 변경하지 않습니다.

네이티브 테스트는 규칙 표의 필드 도달성·양식별 경로/필드 중복 금지, UTF-16 ASCII 비교의 홀수 길이/상위 바이트, 저장 참조의 부재·선행 0·u32 경계·음수와 원문 보존을 검사합니다.

## 실행 결과·적대적 재검토

2026-09-07 최종 소스의 Debug → ReleaseSafe → ReleaseFast 전체 audit를 순차 실행하여 모두 16/16 단계, 네이티브 288/288개, Node 47/47개와 조사 도구 22/22개가 통과했습니다. HWP5 probe 호출 계수는 모드별 1,404,580이며, 고유 기능 수나 전체 지원률이 아닙니다. 최종 로그는 `/tmp/hwpjs-form-schema-debug-final.log`, `/tmp/hwpjs-form-schema-safe.log`, `/tmp/hwpjs-form-schema-fast.log`입니다.

개발 중 양식 종류의 비트 마스크 shift 폭을 명시적으로 변환했고, WASM 테스트 어댑터에서 Zig 0.16에 없는 `std.meta.intToEnum`을 `std.enums.fromInt`로 수정했습니다. 처음 실패한 audit 로그는 `/tmp/hwpjs-form-schema-debug.log`이며 성공 기록에 포함하지 않았습니다. 독립 JS oracle의 상속 프로퍼티 오인도 own-property 검사로 보강한 뒤 최종 전체 검증을 실행했습니다.

최종 세 WASM에서 스키마 검사와 기존 속성 문법 검사를 별도로 재실행하여 모두 같은 결과를 얻었습니다. 스키마는 위 정상 133·거부 241 및 두 실파일의 결과, 기존 문법은 정상 173·거부 245 및 깊이 256 검사입니다. 캐시 ID는 Debug `436eb59da163b62de4bb445804ed4b21`, ReleaseSafe `f3c3345750b129ec7af1e18770bbae6f`, ReleaseFast `25fb05c417be1677443995bb84546e27`입니다. 캐시/임시 로그 보관에 의존하지 않으며 재빌드한 audit에도 검사가 포함됩니다.

재검토는 직접 경로와 타입별 규칙, 중복·미지 노드 보존, 저장 ID의 부재/범위/오버플로, Tree/Report/원본 수명, SSOT와 기본 미지원 진단 유지로 나누어 수행했습니다. 최종 계약 아래 새 결함은 발견하지 못했으며 포맷·JS 문법·변경 문서 링크·diff 검사도 통과했습니다. 스키마 규칙과 참조 범위를 검사한 것을 전체 양식 의미나 전체 명세 완료로 해석하지 않습니다.

## 남은 범위

양식 속성의 모든 값 범위·기본값·표시 활성 조건·리스트 항목·이벤트 의미, 원본 프로그램의 비 BMP 길이 및 다른 버전, 렌더링·편집·저장은 남아 있습니다. [문서·CFB 통합](hwp5-form-document.md)은 선택한 관측 스키마 검사와 저장 참조 진단을 구역 보고서에 연결합니다. 명시적 경로의 자료형/저장 참조 검사를 전체 양식 의미 검증으로 집계하지 않습니다.
