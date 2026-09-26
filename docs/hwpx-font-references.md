# HWPX 언어별 글꼴 ID와 `fontRef` 검증

`Document.inspectFontReferences`는 암호화 선제 거부와 정확한 `Contents/header.xml` 선택 뒤 두 단계로 검사합니다. `font_faces.zig`가 2011 head namespace의 `refList/fontfaces/fontface/font` 직접 계층에서 `HANGUL`, `LATIN`, `HANJA`, `JAPANESE`, `OTHER`, `SYMBOL`, `USER`별 명시적 `font.id`를 각각 색인하고, `font_references.zig`가 직접 `charProperties/charPr/fontRef`의 일곱 소문자 속성을 대응 언어의 목록에 연결합니다. 언어별 ID는 서로 교환하지 않고, 목록 위치를 ID로 간주하지 않습니다. [한컴의 HWPX header 설명](https://tech.hancom.com/python-hwpx-parsing-1/)과 [본문 서식 연결 설명](https://tech.hancom.com/python-hwpx-parsing-2/)에도 언어별 `fontface` 목록과 `fontRef`의 연결이 나타납니다. 고정 리비전 모델의 [fontface 계층](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Head/FontfaceType.cpp)과 [fontRef 속성](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Head/fontRef.cpp)도 대조했습니다.

반환 보고서의 `faces`는 일곱 개의 정렬된 ID 목록을 소유하므로 `FontReferenceReport.deinit`으로 해제합니다. `fontfaces` 그룹 부재, 언어별 `fontface` 부재, `itemCnt`/`fontCnt` 부재(null), 명시적 선언값과 실제 개수의 불일치를 구분합니다. 참조 보고서는 속성 부재, 해결, 대상 ID 부재, 대상 언어 목록 부재를 언어별로 구분하고 첫 미해결 ID와 header manifest 항목 인덱스를 남깁니다. `charPr`의 `fontRef` 요소 부재와 여러 `fontRef` 요소도 별도 진단입니다. ID 0이나 다른 언어의 글꼴을 기본값으로 대입하지 않습니다.

잘못된/중복 언어, 글꼴 ID 부재·손상·중복, 손상된 선언 개수·참조 숫자, XML 오류와 한도 초과는 오류로 반환합니다. 그룹·속성 부재와 개수 불일치, 끊어진 참조는 호환성 정책을 결정하기 전까지 보고서 진단으로 남깁니다. 각 단계는 header XML을 별도로 최대 32MiB 해제하고, 속성 값 기본 상한은 4096바이트이며, 글꼴 ID 합계 기본 상한은 100만 개입니다. 호출자가 조정할 수 있습니다. 공통 ID 존재/부재 규칙은 [header·section 참조가 공유하는 ID 검사](hwpx-header-references.md)와 동일한 `src/hwpx/id_references.zig`를 사용합니다.

이 검사는 `face` 문자열·글꼴 종류·대체 글꼴·내장 폰트 바이트·실제 폰트 설치·글리프 선택을 해석하거나 그 원문을 저장 가능한 모델로 보존하지 않습니다. `font/substFont.binaryItemIDRef`의 [별도 manifest ID 연결](hwpx-binary-references.md)도 자동 호출하지 않습니다. 2011 namespace 이외의 변형, 글자 모양의 다른 하위 필드, 번호·글머리표·그림 연결, 편집·저장도 별도 단계입니다. [header의 다른 여섯 참조](hwpx-header-references.md)와 [section p/run 참조](hwpx-section-references.md)는 독립 API이며 어느 한 보고서만으로 전체 문서가 검증됐다고 주장하지 않습니다.

## 실파일·적대적 검증

두 corpus의 `.hwpx` 484개 중 ZIP 거부 6개와 암호화 2개를 제외한 476개를 검사했습니다. `fontfaces` 그룹은 전부 있었고, `charPr` 30,189개 각각에 `fontRef`가 정확히 하나 있었습니다. 그룹 `itemCnt`와 언어별 `fontCnt`의 불일치는 0개입니다. 언어 순서는 위 순서입니다. 언어별 테이블이 있는 문서 수는 `[476,457,457,457,457,457,457]`, 색인한 ID 수는 `[3252,3403,2912,2905,2547,2888,2539]`, 해결된 참조 수는 `[30189,30169,30169,30169,30169,30169,30169]`입니다. 속성 부재·대상 ID 부재는 전부 0개입니다.

minor 버전 1 문서 19개에는 `HANGUL`만 있고 나머지 여섯 언어 목록이 없습니다. 각 언어에서 명시적 참조 20건이 `absent_table`로 남았고, 해당 문서들의 첫 미해결 ID는 0입니다. 19개 문서의 참조 건수가 언어별 20건이라는 뜻이지 문서마다 20건이라는 뜻은 아닙니다. 이를 자동으로 한글 글꼴 ID 0에 연결하거나 손상으로 확정하지 않습니다.

합성 표본은 희소·역순 ID, 언어별 같은 숫자의 독립성, 목록/속성/요소 부재와 명시적 0, namespace·`refList` 밖 위장, 선언 개수 불일치와 부재, 손상·중복 숫자, 정확한 바이트·ID 한도, 암호 문서 선제 거부, 모든 할당 실패와 ReleaseFast 명시적 해제 회계를 검사합니다. `example.hwpx`와 `noori.hwpx`도 직접 검사합니다. 독립 소스 복사본에서 모든 언어를 한글 테이블에 연결하기, `refList` 경계 제거, 중복 글꼴 ID 검사 제거, 결과 ID 목록 해제 제거 변이를 각각 주입했으며 대응 테스트가 모두 실패했습니다. 마지막 변이는 ReleaseFast에서 924바이트 누수를 검출했습니다.

2026-09-23 당시 실행 결과: HWPX 필터 테스트는 Debug·ReleaseFast 각각 64/64, 기본 전체 테스트는 2086/2086, Debug·ReleaseSafe·ReleaseFast 정규 `audit`는 각각 40/40 단계·2125/2125 테스트, ReleaseSafe `compare`는 8/8 단계·47/47 테스트 통과했습니다. ReleaseSafe 제품 빌드도 통과했습니다. 이 개수는 현재 전체 테스트 수가 아닙니다. corpus 수치는 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX corpus fontface language links read-only survey'` 단독 실행으로 고정했습니다. 전체 corpus 묶음 실행은 메모리 사용량 때문에 완료로 주장하지 않습니다.

2026-09-27 현재 소스에서는 글꼴 참조·글꼴 ID 목록의 집중 테스트와 두 실파일 표본 검사를 Debug·ReleaseSafe·ReleaseFast에서 통과했습니다. 별도 ZIP/XML 조회에서도 `example.hwpx`의 `fontRef` 12개와 `noori.hwpx`의 56개가 각 언어 ID 목록에 모두 연결됐습니다. 단독 ReleaseFast corpus 조사는 허용 476개에서 위 언어별 테이블 수 `[476,457,457,457,457,457,457]`, ID 수 `[3252,3403,2912,2905,2547,2888,2539]`, 해결 수 `[30189,30169,30169,30169,30169,30169,30169]`를 재확인했습니다. 나머지 여섯 언어의 대상 목록 부재는 각 20참조·19문서이고 모두 minor 1이었습니다. 전체 audit·과거 변이 검사는 이번에 다시 실행하지 않았습니다.
