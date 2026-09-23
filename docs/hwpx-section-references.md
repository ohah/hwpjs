# HWPX section 서식 참조 검증

`Document.inspectReferences`는 기존 [header·spine 구조](hwpx-document-structure.md)와 [header 리소스 ID 색인](hwpx-header-resources.md)을 같은 문서에 적용한 뒤, spine 순서의 section XML을 다시 읽어 본문 서식 참조를 검사합니다. 2011 paragraph namespace의 모든 `p`에서 `paraPrIDRef`·`styleIDRef`, 모든 `run`에서 `charPrIDRef`를 읽고 각각 header의 `paraPr`·`style`·`charPr` 명시적 ID와 대조합니다. 배열 위치나 ID 0을 기본값으로 쓰지 않습니다. section의 직접 자식이 아닌 문단도 검사하며 별도 집계합니다. 문단의 직접 자식이 아닌 run도 별도 집계하고 참조는 검사합니다. namespace가 다른 같은 로컬명은 세지 않습니다.

참조 종류별로 속성 존재·부재, 해결된 참조, 대상 ID 부재, 대상 그룹 자체의 부재를 따로 보고합니다. 해결되지 않은 첫 ID와 section manifest 항목 인덱스를 남기며, 인덱스 해석에는 반환 원본 `Document`의 수명이 필요합니다. 속성 부재와 명시적 0은 다릅니다. 해결되지 않은 참조를 임의 보정하거나 조용히 성공으로 바꾸지 않지만, 실파일 편차 조사와 호환성 정책을 위해 이 단계에서는 진단으로 반환합니다. 숫자 손상·`u32` 초과, XML 구조·namespace 오류와 한도 초과는 오류로 반환합니다. 보고서는 숫자 진단만 보유해 별도 해제가 필요 없습니다.

이 진입점은 구조 검증의 header+spine 총량, header 리소스 색인의 별도 한도, section 참조 재검사의 별도 한도를 각각 사용합니다. 참조 재검사의 기본 상한은 section 엔트리당 128MiB·합계 256MiB, 색인 대상 속성 값 4096바이트, 문단 200만 개·run 400만 개입니다. 호출자가 조정할 수 있습니다. 반복 해제한 section XML은 각 단계의 한도에서 독립적으로 계산하며 전체 단계의 단일 바이트 총량인 것처럼 설명하지 않습니다. [한컴의 공식 서식 연결 설명](https://tech.hancom.com/python-hwpx-parsing-2/)은 p의 문단 모양·스타일 참조와 run의 글자 모양 참조를 header의 `refList`와 연결합니다.

이 검사는 문단의 `id`, [별도 API의 스타일·header 내부 참조](hwpx-header-references.md), 글꼴별 ID, 중첩 개체·표의 의미, [별도 API의 그림·OLE 등 이진 ID 연결](hwpx-binary-references.md), BinData 바이트, 조건부 XML 분기의 선택, 2021/2024 namespace 변형, 편집·저장을 아직 다루지 않습니다. 조건부 분기가 있는 경우에도 실제 선택 분기만 판정했다고 주장하지 않고, XML에 나타난 일치 namespace의 모든 문단·run을 집계합니다. 전체 문서 검증은 후속 단계입니다.

## 실파일·적대적 검증

합성 XML에서 희소 ID·중첩 문단·비직접 run·다른 namespace 위장, 속성 부재와 명시적 ID 0, 대상 그룹 부재와 ID 부재, 손상·초과 숫자, 정확한 바이트·요소 한도, 모든 할당 실패와 ReleaseFast 명시적 해제 회계를 검사합니다. `example.hwpx`와 `noori.hwpx`도 이 진입점으로 검사합니다.

두 corpus의 `.hwpx` 484개 중 ZIP 거부 6개와 암호화 2개를 제외한 476개를 조사했습니다. section 544개에서 문단 215,146개(section 비직접 자식 138,226개), run 267,347개를 검사했고 문단 비직접 자식 run은 0개였습니다. 문단 모양·스타일·글자 모양 순서로 해결된 참조는 `[215146,214888,267347]`, 속성 부재는 `[0,0,0]`, 대상 ID 부재는 `[0,0,0]`입니다. 스타일 참조 258건은 스타일 ID가 잘못된 경우가 아니라 header의 `styles` 그룹 자체가 없는 문서 21개에서 나왔습니다. 조사한 21개는 모두 minor 버전 1이고 첫 미해결 스타일 ID는 0입니다. minor 버전 1 전체가 그렇다는 뜻은 아닙니다. 이 사례를 ID 0의 묵시적 기본 스타일로 처리하거나 전체 서식 검증 성공으로 표시하지 않습니다.

독립 소스 복사본에서 세 결함을 각각 주입했습니다. 명시적 ID 대신 배열 위치로 대조한 경우 희소 ID 테스트, 속성 부재를 세지 않은 경우 부재/명시적 0 테스트, section 간 바이트 잔량을 차감하지 않은 경우 두 section의 합계 한도 테스트가 모두 예상대로 실패했습니다. 원본 제품 소스에는 변이를 적용하지 않았습니다.

최종 소스의 HWPX 전용 테스트는 Debug·ReleaseFast 각각 52/52, 전체 기본 테스트는 2,074/2,074 통과했습니다. ReleaseSafe 제품 빌드와 독립 비교 검사는 각각 5/5·8/8 단계 통과했습니다. 전체 audit는 Debug·ReleaseSafe·ReleaseFast 각각 40/40 단계·2,113/2,113 테스트가 통과했습니다. 이번 section 참조 전수 조사는 ReleaseFast에서 476개 문서 대상으로 단독 통과했습니다. 선택적 `hwpx_structure_survey.zig` 전체 묶음 실행은 네 번째 corpus 조사 중 신호 KILL로 끝났고, 단독 재실행에서는 첫 검사 중 큰 메모리 사용량을 확인해 안전하게 중단했습니다. 따라서 묶음 23/23 통과라고 주장하지 않습니다. 각 corpus 조사 항목은 별도 실행 또는 묶음 실행의 해당 항목에서 각각 성공했습니다. 이 결과는 section 의미 검증 전체나 편집·저장 지원의 근거가 아닙니다.
