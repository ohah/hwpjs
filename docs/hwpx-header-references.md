# HWPX header 내부 리소스 참조 검증

`Document.inspectHeaderReferences`는 암호화 여부와 정확한 header 엔트리를 먼저 확인하고, 기존 [명시적 리소스 ID 색인](hwpx-header-resources.md)을 만든 뒤 같은 header XML을 다시 읽습니다. `refList`의 직접 그룹/항목에서만 여섯 연결을 검사합니다: `style.paraPrIDRef → paraPr`, `style.charPrIDRef → charPr`, `style.nextStyleIDRef → style`, `paraPr.tabPrIDRef → tabPr`, `paraPr/border.borderFillIDRef → borderFill`, `charPr.borderFillIDRef → borderFill`. XML namespace와 부모·깊이를 함께 검사하므로 다른 namespace의 동일 이름, 그룹 밖의 동명 요소, 더 깊은 후손은 끼워 넣지 않습니다. ID는 정렬된 명시적 ID로 조회하며 목록 위치를 사용하지 않습니다.

각 종류는 속성 부재, 해결, 대상 ID 부재, 대상 그룹 부재를 따로 집계합니다. 명시적 ID 0은 부재와 다릅니다. 첫 미해결 ID와 header의 manifest 항목 인덱스를 남기며, 인덱스는 반환 원본 `Document`의 수명에 묶입니다. `paraPr` 자체에 `border` 요소가 없는 경우는 `paragraphs_without_border_element`로 세고, `border` 요소에 `borderFillIDRef`가 없는 경우는 해당 참조의 `absent`로 세어 구분합니다. `type="CHAR"` 스타일의 문단 모양/다음 스타일 대상 ID 부재는 별도 진단에도 남깁니다. `CHAR`에서는 해당 속성이 무시되는지 단정하지 않고 원시 연결 결과를 보존합니다.

손상된 숫자·`u32` 초과, XML 문법/namespace 오류, 한도 초과는 오류입니다. 미해결 참조는 조용히 보정하거나 ID 0으로 바꾸지 않으며 실파일 편차를 위해 진단으로 반환합니다. 목록 색인과 내부 참조 검사는 header XML을 각각 최대 32MiB 해제하는 별도 단계이고, 각 단계의 속성 값 기본 한도는 4096바이트입니다. 보고서는 숫자 진단만 소유하여 별도 해제가 필요 없습니다. 공통 ID 대조·속성 부재 정책은 `src/hwpx/id_references.zig`가 section 참조 검사와 함께 소유합니다. [한컴의 공식 HWPX 파싱 설명](https://tech.hancom.com/python-hwpx-parsing-2/)은 header의 `refList`와 본문의 서식 ID 연결을 설명하며, 이 여섯 세부 속성은 실제 표본 XML에서도 확인했습니다.

이는 header의 모든 스키마 제약을 검사하지 않습니다. [별도 API의 언어별 글꼴 ID·fontRef](hwpx-font-references.md)와 [번호·글머리표 일부 내부 참조](hwpx-list-references.md), 탭의 내부 필드, 스타일 타입별 적용 정책, 문단/글자 모양의 다른 하위 필드, 그림·BinData 참조, 2021/2024 namespace, 편집·저장은 별도 단계입니다. [section p/run 참조](hwpx-section-references.md)는 이 API를 암묵적으로 호출하지 않으므로 어느 하나의 통과를 전체 문서 통과로 간주하지 않습니다.

## 실파일과 적대적 검증

두 corpus의 `.hwpx` 484개 중 ZIP 거부 6개와 암호화 2개를 제외한 476개를 검사했습니다. 위 여섯 연결 순서대로 해결은 `[13060,13061,13055,28111,28144,30189]`, 속성 부재는 모두 0, 대상 ID 부재는 `[1,0,6,0,0,0]`, 대상 그룹 부재는 `[0,0,0,33,0,0]`입니다. 스타일은 13,061개(그중 `CHAR` 344개), 문단 모양은 28,144개, 글자 모양은 30,189개입니다. 문단 모양의 `border` 요소도 28,144개로 이 corpus에서 요소 부재는 0개였습니다.

문단 모양 대상 누락 1건은 minor 0 문서의 `CHAR` 스타일에 있는 ID `6619237`입니다. 다음 스타일 대상 누락 6건도 minor 1 문서 2개의 `CHAR` 스타일에서 나왔습니다. 탭 그룹 부재 참조 33건은 minor 1 문서 21개에서 발생했고 첫 미해결 ID는 0입니다. 이를 손상, 묵시적 기본값, `CHAR`의 무시 필드 중 어느 것으로도 자동 판정하지 않습니다. 세 종류의 문서 수는 `[1,2,21]`로 집계하며, 전체 문서 중 minor 버전별 발생률을 주장하지 않습니다.

합성 표본은 희소·역순 ID, style 자기/교차 연결, attr 부재/명시적 0, 테이블 부재/ID 부재, `border` 요소 부재와 그 속성 부재, namespace 위장, `refList` 바깥의 위장 그룹, 손상/초과 숫자, 정확한 byte/ID 한도, 암호화 선제 거부, 모든 할당 실패 및 ReleaseFast 명시적 해제 회계를 검사합니다. `example.hwpx`와 `noori.hwpx`에서도 여섯 연결을 순회했습니다. 독립 소스 복사본에서 ID를 목록 위치로 바꾸기, 정확한 style namespace 확인 제거, 속성 부재 집계 제거, `refList` 진입 검사 제거, 리소스 목록 해제 제거 변이를 각각 주입했습니다. 앞의 넷은 해당 값/namespace/그룹 경계 테스트에서 실패했고 마지막은 ReleaseFast에서 660바이트 누수로 검출됐습니다. 처음의 진입 검사 변이는 깊이가 맞지 않는 위장 그룹만 두어 검출되지 않았고, 같은 깊이의 중첩 위장 그룹을 추가한 뒤 실패를 재현했습니다.

최종 소스의 HWPX 전용 테스트는 Debug·ReleaseFast 각각 57/57, 기본 테스트는 2,079/2,079 통과했습니다. ReleaseSafe 제품 빌드와 비교 검사는 각각 5/5·8/8 단계 통과했고, 전체 audit는 Debug·ReleaseSafe·ReleaseFast 각각 40/40 단계·2,118/2,118 테스트가 통과했습니다. 새 header 연결 전수 조사는 ReleaseFast로 별도 실행해 476개를 완료했습니다. 큰 메모리를 쓰는 선택적 HWPX 전체 묶음 조사 `23/23` 완료를 이번 결과로 주장하지 않습니다. 다른 HWP5/WASM audit 통과도 HWPX 모든 내부 필드가 검증됐다는 뜻은 아닙니다.
