# HWPX header 리소스 ID 색인

`Document.inspectHeaderResources`는 [패키지 구조 계층](hwpx-document-structure.md)과 같은 정확한 `Contents/header.xml` 선택·암호화 선제 거부를 거쳐 2011 head namespace의 XML을 전부 문법·namespace 검사합니다. 직접 `refList` 아래의 `borderFills/borderFill`, `charProperties/charPr`, `tabProperties/tabPr`, `numberings/numbering`, `bullets/bullet`, `paraProperties/paraPr`, `styles/style`, `memoProperties/memoPr` 여덟 그룹만 색인합니다. 각 직접 항목의 명시적 `id`를 XML 문자 참조 해석 뒤 `u32`로 읽고 정렬하며 중복 수치 ID는 오류입니다. 목록 위치를 ID로 가정하지 않습니다. 메모 그룹은 한컴의 [목록](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Head/memoProperties.cpp)·[항목](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Head/MemoShapeType.h) 모델과 대조했습니다. 구역 ID 진단은 [별도 계약](hwpx-section-definition-references.md)이 소유합니다.

그룹 부재는 `present=false`, 그룹은 있으나 `itemCnt`가 없으면 `declared_count=null`로 남깁니다. 선언값과 실제 항목 수의 비교는 `countMatches()`가 `?bool`로 제공합니다. 불일치를 자동 보정하지 않습니다. 알려진 그룹의 중복 선언, 항목 ID 부재·잘못된 숫자·중복, 잘못된 root 또는 `refList` 부재는 오류입니다. 알 수 없는 `refList` 그룹이나 하위 payload는 XML 문법만 검사하며 ID 색인·의미 검증 완료로 세지 않습니다. 원문 보존·저장은 아직 미구현입니다. 반환 목록과 조회 메서드는 보고서가 소유하고 `deinit`으로 해제합니다.

기본 한도는 header XML 32MiB, 색인 대상 속성 값 4096바이트, 여덟 그룹의 ID 합계 100만 개이며 호출자가 조정할 수 있습니다. ID와 `itemCnt`가 `u32`를 넘는 값은 현재 미지원 오류로 처리합니다. 이 색인 단계 자체는 [fontfaces의 언어별 ID](hwpx-font-references.md), [style·문단·글자 모양 내부 연결](hwpx-header-references.md), [번호·글머리표 내부 연결](hwpx-list-references.md), [문단·run의 서식 참조](hwpx-section-references.md), [별도 API의 이진 리소스 연결](hwpx-binary-references.md), 알 수 없는 그룹의 리소스, 편집·저장을 검증하지 않습니다. 2011 namespace 이외 OWPML 변형도 지원 범위로 주장하지 않습니다. [한컴의 공식 파싱 설명](https://tech.hancom.com/python-hwpx-parsing-2/)은 `refList`가 본문 서식 매핑을 소유하고 `charPr`·`paraPr`의 명시적 ID를 참조한다고 설명합니다.

## 실파일·적대적 검증

이 절의 기존 테스트 개수는 2026-09-23의 일곱 그룹 기록입니다. 메모 그룹 추가 후 결과는 [구역 ID 참조 기록](hwpx-section-definition-references.md)이 소유합니다.

2026-09-23 두 corpus의 `.hwpx` 484개 중 ZIP 거부 6개, 암호화 2개를 제외한 476개가 당시 일곱 그룹의 ID 색인을 통과했습니다. 당시 그룹 순서대로 선언 개수 불일치는 `[0,0,0,0,0,0,0]`, 그룹 부재는 `[0,0,21,125,442,0,21]`개였고 부재 그룹의 `itemCnt`도 부재로 보존됐습니다. `example.hwpx`에서 글자 모양 12개·문단 모양 16개·스타일 18개와 1부터 시작하는 borderFill ID를 확인했고, `noori.hwpx`에서는 bullet ID 1을 확인했습니다. 합성 표본은 희소·역순 ID, XML 숫자 참조, 숫자 표기만 다른 중복 ID, namespace 위장, 선언 불일치·부재, 정확한 크기·개수 한도, 암호 문서 선제 거부, 모든 할당 실패와 ReleaseFast의 명시적 해제 회계를 검사합니다. 새 메모 그룹 조사 범위는 [구역 ID 참조](hwpx-section-definition-references.md)에 기록합니다.

독립 소스 복사본에 ID를 위치 인덱스로 바꾸기, 중복 ID 검사를 제거하기, 보고서 ID 배열 해제를 제거하기의 세 변이를 주입했습니다. 각각 희소 ID 테스트·중복 ID 오류 테스트·ReleaseFast 할당 회계 테스트에서 실패했고 마지막 변이는 396바이트 누수로 검출됐습니다. 이 검증은 색인 계약에 국한되며 section의 서식 참조가 실제로 존재한다는 증거는 아닙니다.

2026-09-23 당시 검증 실행 결과는 HWPX 전용 Debug·ReleaseFast 각각 47/47, 선택적 corpus 조사 ReleaseFast 22/22, 전체 기본 테스트 2069/2069 통과입니다. 전체 audit는 Debug·ReleaseSafe·ReleaseFast 각각 40/40 단계·2108/2108 테스트가 통과했고, ReleaseSafe 제품 빌드와 비교 검증도 통과했습니다. 이 개수는 현재 전체 테스트 수가 아니며 section 내부 참조 검증 완료로 확대하지 않습니다.

2026-09-27 현재 소스의 `HWPX header resource` 합성 테스트 5개와 실파일 두 표본 검사를 Debug·ReleaseSafe·ReleaseFast에서 통과했습니다. 단독 ReleaseFast corpus 조사는 당시 일곱 그룹 순서로 선언 불일치 `[0,0,0,0,0,0,0]`, 그룹 부재 `[0,0,21,125,442,0,21]`을 다시 확인했습니다. `example.hwpx`의 글자 모양 12·문단 모양 16·스타일 18, borderFill ID 1·2·3과 `noori.hwpx`의 bullet ID 1은 별도 ZIP/XML 조회로도 확인했습니다. 이 일곱 그룹 조사는 여덟 번째 메모 그룹의 corpus 수치를 증명하지 않으며, 그 범위는 위에 연결한 별도 문서가 소유합니다. 전체 audit와 과거 변이 검사는 이번에 다시 실행하지 않았습니다.


## 표시 조회용 헤더 합성

위의 읽기 전용 ID 색인 API와 달리, 이 절은 편집 의도를 현재 header에 반영하는 내부 합성 경로를 다룹니다. `header_resource_save.zig`는 기존 `header_batch_resource_save.zig`의 fragment planner를 canonical header 생성에도 재사용합니다. 표시 조회는 저장과 같은 원본·편집 의도에서 임시 헤더를 합성하며 새 지속 캐시·저장 모델·Native ABI를 추가하지 않습니다. 임시 값은 호출 안에서 해제하고 세션 간 보관하지 않습니다.

기존 inventory 검사와 리소스 생성 순서·ID를 유지합니다. `itemCnt`·`fontCnt`는 디코딩 숫자뿐 아니라 원문 어휘가 canonical 표기인지 확인합니다. 비정규 어휘나 미지원 형태는 기존 raw 순차 writer로 돌아갑니다. 개수 표기 변경으로 XML이 짧아질 수 있는 입력을 일괄 조립해 기존 중간 `maxXML` 예산 오류를 없애지 않습니다. planner의 비할당 오류도 기존 writer가 검증·오류 우선순위를 결정하도록 돌아가며 OOM은 그대로 전달합니다. 최종 XML 검사와 raw 경로를 생략하지 않습니다.

### 같은 SDK의 직접 비교

같은 SDK manifest 75e1·진단 코드·입력으로 BD/EDE를 단일 순차 비교했습니다. 13개 헤더 조회의 10 snapshot과 정렬·글꼴 redo 저장본 2개의 raw 바이트가 각각 같았고 기능·history·rollback 검사를 통과했습니다.

| 관측 구간 | BD | EDE |
| --- | ---: | ---: |
| 두 대상 일곱 글꼴 적용의 SDK 대기 | 7096ms | 1637ms |
| 그 요청 안의 Reader display | 6367ms | 880ms |
| 직후 query의 SDK 대기 | 1697ms | 198ms |
| 글꼴 redo의 SDK 대기 | 6992ms | 985ms |
| 글꼴 undo의 SDK 대기 | 296ms | 351ms |

반올림한 단일 샘플이며 display에 포함된 Styles 시간을 중복 합산하지 않습니다. undo는 이 샘플에서 늘었으므로 모든 연산 개선을 주장하지 않습니다. redo의 raw apply 계측 0은 해당 ABI 미계측이며 Native 미실행이 아닙니다. 서로 다른 SDK의 이전 시간과 합산하지 않습니다. 이 결과는 직접 Node SDK 진단이며 실제 Web UI·Canvas 지연·배포 속도·전체 API O(n)의 근거가 아닙니다. 후속 명시 Native6와 pure1은 닫힌 공통 Core479·provider75e1·같은 Noori 입력에서 BD/EDE 각각 39통과·실패/skip0·guard null·drift/잔류 없음으로 완료됐습니다. 같은 39종의 엔진별 실행이며 독립 78종이 아닙니다. 해당 CI 핀 변경이 포함된 HEAD a2ffa의 JavaScript Quality 41973821370 성공은 이 직접 비교와 별도 근거입니다. 전체 Zig5059·case285 완료나 전체 Native 통과로 확대하지 않습니다.

후속 실제 EDE Canvas 대표 글꼴 검증은 [서식 UI 검증 경계](formatting-dialogs.md#헤더-합성-후속-검증의-경계)에 구분해 기록합니다. 이 단일 SDK 비교만으로 전체 UI 평균·전체 선형성·공개 배포 완료를 주장하지 않습니다.
