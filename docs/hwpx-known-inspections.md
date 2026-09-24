# HWPX 현재 지원 검사 묶음

`inspectKnown`은 조건부 참조의 양쪽 분기를 관측하며, 활성 분기만의 이진·차트 참조는 별도 [조건부 참조 선택](hwpx-switch-selection.md) API가 제공합니다.

[settings.xml 원값 검사](hwpx-settings.md)도 묶음에 포함됩니다. 값의 일부 어휘 검사만 제공하며 settings 전체 스키마나 동작 의미의 완료는 아닙니다.

[masterpage 파트·section 참조](hwpx-master-pages.md)도 묶음에 포함됩니다. 연결 진단은 바탕쪽 내부/배치 의미나 전체 문서 유효성 판정이 아닙니다.

직접 `hp:subList`의 원값과 직접 문단 수는 [ParaListType 속성](hwpx-para-list.md) 계약으로 추가 검사합니다. 중첩 내용의 의미 해석은 여전히 포함되지 않습니다.

마스터페이지의 직접 `subList` 아래 모든 `hp:p`에는 section에서 쓰는 [문단 메타 값 규칙](hwpx-paragraph-metadata.md)을 적용합니다. 직접/중첩 문단의 구분, 서식 참조의 대상 검사와 본문 내용 의미는 각각 별개 계약입니다.

[마스터페이지 문단·run 서식 참조](hwpx-master-style-references.md)는 같은 header 리소스 ID 판정을 마스터페이지의 직접 `subList` 후손에 적용합니다. 미해결 대상은 진단이며 표시·편집 완료 판정이 아닙니다.

[run 변경 추적 ID 원값](hwpx-run-metadata.md)은 section 결과를 별도 보고서로, 마스터페이지 결과를 각 `subList`에 남깁니다. 대체 표기나 충돌을 관측할 뿐 변경 추적 의미를 적용하지 않습니다.

[run 위치·직접 자식 진단](hwpx-run-topology.md)은 section·마스터페이지 결과를 별도로 반환합니다. 공개 모델 미등록 자식이나 늦은 `secPr`는 즉시 문서 오류로 거부하지 않습니다.

직접 [조건부 switch 구조 진단](hwpx-switch-shape.md)은 두 run topology 보고서의 `switches` 필드에 포함됩니다. 두 분기의 선택·적용은 아직 판정하지 않습니다.

[`hp:t` 원값·직접 자식 진단](hwpx-text-nodes.md)도 두 범위의 별도 보고서를 반환합니다. 선택적 `charStyleIDRef`의 부재와 값, 모델/XSD 표기 차이를 보존하며 표시 텍스트를 합성하지 않습니다.

직접 [`hp:tab` 속성 진단](hwpx-inline-tab.md)은 두 text 노드 보고서의 `tab` 필드에 포함됩니다. 숫자형과 이름형의 대응·화면상 간격은 판정하지 않습니다.

직접 [인라인 주석 마커 속성 진단](hwpx-inline-annotations.md)은 두 text 노드 보고서의 `markpen`·`title_mark` 필드에 포함됩니다. 시작/끝 짝과 표시 효과는 판정하지 않습니다.

직접 [인라인 변경 추적 태그 진단](hwpx-track-change-tags.md)은 두 text 노드 보고서의 `track_change_tags` 필드에 포함됩니다. 네 태그의 참조·짝과 변경 적용은 판정하지 않습니다.

`Document.inspectKnown(allocator, options)`는 같은 패키지 문서에 현재 공개된 개별 검사를 순서대로 적용하고 `KnownReport`를 반환합니다. ZIP/OCF/OPF 관계는 선행 `inspectDocument`가 검사합니다. 이 API는 보호 manifest를 먼저 확인한 뒤 [모든 ZIP 엔트리 바이트 무결성](hwpx-payload-integrity.md), [OPF 선언 XML 전수 문법 검사](hwpx-manifest-xml.md), version XML, header·spine 구조, header 리소스 ID, section/헤더 서식 참조, 언어별 글꼴, 번호·글머리표, 이진 리소스 연결, 차트 경로·캐시·수식 구조, section 텍스트 이벤트, 문단·run 메타 속성, run·text 자식 진단, header 시작 번호의 기존 보고서를 묶습니다. 같은 이름의 파서나 참조 규칙을 새로 만들지 않고 `Document`의 각 진입점을 호출합니다.

반환 보고서는 소유 문자열·배열을 `deinit(allocator)`으로 해제합니다. 원본 `Document`·ZIP 바이트를 해제해도 보고서의 소유 값은 유효하지만 manifest item 인덱스를 파일 경로로 역참조하려면 원본 문서가 필요합니다. 암호화된 항목이 보호 manifest에 있으면 `EncryptedDocument`로 멈추며, 암호화 분류만 필요하면 기존 `inspectProtection`을 사용합니다. 구조·서식 참조·차트 등의 미해결 항목은 해당 보고서의 진단값으로 남습니다. `inspectKnown`의 성공은 이 진단값이 모두 0이거나 **전체 문서가 유효하다는 뜻이 아닙니다.**

각 단계의 `options`와 메모리·해제 바이트 한도는 기존 검사 계약 그대로 독립 적용됩니다. 하나의 전역 해제량 예산이나 전체 문서 스키마 검증을 새로 제공하지 않습니다. 일부 XML을 여러 단계에서 다시 읽으므로 큰 문서에서는 비용이 높습니다. 호출 중 어느 단계에서든 오류가 나면 이전 단계의 소유 보고서와 임시 XML 트리를 정리합니다.

미구현 범위는 2011 외 OWPML namespace의 의미, 전체 header/section XSD 및 조건부 분기, settings/masterpage 의미, OPF 밖 XML과 BinData의 실제 포맷 의미 검사, 차트 수식의 의미·표시, 문서 모델·레이아웃, 편집·저장·무손실 왕복입니다. ZIP 바이트 CRC나 XML 문법 통과만으로는 내부 포맷을 보증하지 않습니다. 이 API의 이름을 `validateDocument`나 완료 판정으로 바꾸지 않는 이유입니다.

현재 Zig 코어 API이며 제품 JS/WASM 공개 API에는 아직 연결되지 않았습니다.

## 검증

합성 패키지와 실제 HWPX 예제에서 모든 보고서의 구역 수 연결, 원본 해제 뒤 보고서 수명, 단계별 한도, 마지막 단계 실패 뒤 명시적 할당 회계, 모든 할당 실패 지점의 원자적 정리를 검사합니다. 암호화 manifest와 손상된 version XML이 함께 있으면 암호화 진단이 먼저 나오며 누수가 없는지도 검사합니다. 선택 실파일 검사는 기존 두 corpus를 8개 독립 shard로 나눠 수행하며 결과와 재현 명령은 [개발·검증 명령](development-commands.md)에 기록합니다.

2026-09-24 실측에서 로컬 HWPX 484개 중 ZIP 거부 6개·암호화 2개를 제외한 476개 문서의 544개 section·215,146개 문단을 8개 shard에서 묶음 검사했습니다. `beginNum` 존재 455개·문단 `id` 부재 0개와 section 수가 독립 Python 조사 및 개별 보고서와 일치했습니다. 성공 보고서에도 스타일 대상 테이블 부재 같은 미해결 진단이 남을 수 있음을 합성 패키지로 확인했습니다. 이 집계는 **문서별 모든 의미 필드의 적합성**이나 전체 HWPX 스키마 적합성을 증명하지 않습니다.

첫 조사 방식은 하나의 테스트 할당자를 shard의 모든 문서에 재사용한 채 여러 shard를 병렬 실행해 RSS가 과도하게 증가했습니다. 해당 실행은 결과를 기다리지 않고 종료했습니다. 수정한 선택 조사에서는 문서마다 안전 검사 할당자를 새로 만들고 동시 요청 바이트 2 GiB 상한 및 종료 시 잔여 0바이트를 확인합니다. 이 방식으로 8개 shard를 재실행해 모두 통과했습니다. 초기 RSS 증가의 내부 원인을 제품 누수로 단정하지 않으며, 묶음 API가 동일 XML을 여러 번 읽는 비용은 별도로 개선해야 합니다.

수정한 조사기는 기존 XML 트리 조사기와 같은 Zig 기대값 파일 `src/hwpx_corpus_expectations.zig`를 공유합니다. 독립 Python ZIP/XML 조사 `tools/hwpx-section-text-oracle.py`는 그 파일을 읽지 않습니다.

같은 최종 소스의 네이티브 Debug 전체 테스트 2,193개와 전용 테스트 6개(Debug·ReleaseSafe·ReleaseFast), ReleaseSafe 제품 빌드 및 전체 Debug `zig build audit --summary all`이 통과했습니다. 선택 실파일 8개 shard와 독립 Python 조사도 재실행해 위 수치가 일치했습니다. 실파일 검사는 기본 audit에 포함되지 않습니다.

후속 [전 ZIP 엔트리 바이트 무결성](hwpx-payload-integrity.md)을 묶음 검사에 연결한 뒤, 최종 소스에서 네이티브 Debug 전체 테스트 2,199개와 실파일 8개 shard를 다시 통과했습니다. 앞 문단의 2,193개는 이전 소스의 실측이며, 새 실측으로 소급해 변경하지 않습니다. 새 단계는 ZIP 길이·CRC만 추가로 증명하며 문서 의미 완성도를 올려 계산하지 않습니다.

그다음 [OPF 선언 XML 문법 검사](hwpx-manifest-xml.md)를 연결한 소스에서는 전체 Debug 테스트 2,204개와 실파일 8개 shard가 통과했습니다. 이 단계는 settings·masterpage 등 선언 XML의 문법·namespace까지만 추가하며 XSD·필드 의미의 완료를 주장하지 않습니다.

후속 [settings.xml 원값 검사](hwpx-settings.md)를 연결한 소스에서는 전체 Debug 테스트 2,212개와 실파일 8개 shard가 통과했습니다. Caret/config의 관측된 값·개수 대조는 settings 주제 문서에 기록하며, `inspectKnown` 성공을 전체 설정·문서 의미의 적합성으로 승격하지 않습니다.

후속 [masterpage 파트·section 참조](hwpx-master-pages.md)를 연결한 소스에서는 전체 Debug 테스트 2,219개와 실파일 8개 shard가 통과했습니다. 루트 값·참조 ID 연결만 추가했고 `subList` 내부 및 쪽 배치 의미는 미검증입니다.

이번 [ParaListType 직접 속성](hwpx-para-list.md) 단계에서는 전체 Debug 테스트 2,224개와 선택 실파일 8개 shard가 통과했습니다. 이 단계에서 추가된 것은 직접 `subList` 속성·직접 문단 경계이며, 중첩 본문 의미와 쪽 배치는 여전히 미검증입니다.

다음 [마스터페이지 문단 메타 값](hwpx-paragraph-metadata.md) 재사용 단계에서는 전체 Debug 테스트 2,226개와 선택 실파일 8개 shard가 통과했습니다. 직접·중첩 문단의 메타 값 적합성만 더했고, 서식 참조·본문 의미·쪽 배치를 검증 완료로 바꾸지 않았습니다.

이번 [마스터페이지 문단·run 서식 참조](hwpx-master-style-references.md) 단계에서는 전체 Debug 테스트 2,231개와 선택 실파일 8개 shard가 통과했습니다. section과 속성→header ID 판정을 공유하고 마스터페이지의 직접 `subList` 아래에만 적용했습니다. 이 결과는 서식 참조 연결에 한정되며 본문 의미·쪽 배치·편집/저장 완료를 뜻하지 않습니다.

후속 [run 변경 추적 ID 원값](hwpx-run-metadata.md) 단계에서는 전체 Debug 테스트 2,237개와 선택 실파일 8개 shard가 통과했습니다. section과 마스터페이지의 동일 필드 판정을 공유하지만 corpus에서는 해당 속성 출현이 0건이므로, 명시적 값·충돌 정책은 합성 테스트만 뒷받침합니다. 변경 추적 의미·부모/자식 구조·편집/저장은 미검증입니다.

후속 [run 위치·직접 자식 진단](hwpx-run-topology.md) 단계에서는 전체 Debug 테스트 2,243개와 선택 실파일 8개 shard가 통과했습니다. 실파일의 늦은 `secPr` 및 공개 모델 미등록 자식도 별도 범주로 대조했으며, run 자식의 의미·중첩 스키마·편집/저장은 계속 미검증입니다.

후속 [`hp:t` 원값·직접 자식 진단](hwpx-text-nodes.md) 단계에서는 전체 Debug 테스트 2,248개, ReleaseSafe 전체 audit 40단계·2,287개 테스트 및 선택 실파일 8개 shard가 통과했습니다. 32비트 초과 원값도 독립 oracle에 별도 집계했으며, `t` 내부 자식의 속성·의미와 편집/저장은 여전히 미검증입니다.

후속 [직접 `hp:tab` 속성 진단](hwpx-inline-tab.md) 단계에서는 전체 Debug 테스트 2,252개, ReleaseSafe 전체 audit 40단계·2,291개 테스트와 선택 실파일 8개 shard가 통과했습니다. 숫자형 실파일과 XSD 이름형 합성 입력을 분리해 검증했으며, 탭의 화면상 위치·너비와 다른 인라인 제어 요소의 의미는 미검증입니다.
