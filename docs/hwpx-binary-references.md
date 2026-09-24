# HWPX 이진 리소스 manifest 연결

기본 보고서는 조건부 양쪽 분기를 관측합니다. 호출자 capability를 적용한 선택적 결과는 [조건부 참조 선택](hwpx-switch-selection.md)을 참조합니다.

`Document.inspectBinaryReferences`는 [제품 header·spine 구조](hwpx-document-structure.md)가 선택한 `Contents/header.xml`과 section XML만 다시 읽고, XML의 `binaryItemIDRef` 문자열을 같은 문서의 OPF manifest `item.id`와 정확히 대조합니다. ZIP 파일명이나 manifest 배열 위치를 ID로 취급하지 않습니다. 암호화 문서는 먼저 거부합니다. 내장 item은 `entry_index`가 있는 것으로, `isEmbeded="0"` 외부 item은 별도로 분류합니다. 외부 링크를 네트워크에서 가져오지 않고 내장 바이너리의 바이트도 해제하지 않습니다.

한컴 공개 모델의 [`ImageType.binaryItemIDRef`](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Core/ImageType.cpp#L54-L76)는 그림과 이미지 브러시에, [`OLEType.binaryItemIDRef`](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/OLEType.cpp#L103-L125)는 본문 OLE에 있습니다. 헤더의 [`font`](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Head/font.cpp#L50-L71)와 [`substFont`](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Head/substFont.cpp#L44-L63)에도 이 속성이 있습니다. 제품 스캐너는 이를 여섯 출처로 구분합니다: 헤더 font·substFont·borderFill 이미지 브러시, section pic 이미지·도형 이미지 브러시·OLE. `hp:switch`의 `case/default` 안에 있는 개체도 읽되, 조건 선택 없이 XML에 존재하는 양쪽 분기를 각각 집계합니다.

출처를 확인할 수 없는 요소의 같은 속성은 `unclassified_attribute_sites`로 따로 남기며 임의의 그림·OLE로 승격하지 않습니다. 인식된 출처마다 속성 부재, 빈 문자열, 내장 item 해결, 외부 item 해결, manifest 대상 ID 부재를 구분합니다. 첫 대상 누락 ID와 첫 미분류 ID는 소유 문자열로 보존하고 source manifest 항목 인덱스를 함께 반환하므로 `BinaryReferenceReport.deinit`이 필요합니다. 공통 OPF item 목록의 소유권은 기존 `Document`가 유지합니다.

XML은 namespace·문법을 전체 검사합니다. 기본 한도는 header 32MiB, section 엔트리당 128MiB, 재검사 XML 합계 256MiB, 속성값 4096바이트, 인식·미분류 위치 합계 100만 개, 조상 추적 깊이 256입니다. 앞선 패키지·구조 검사의 해제량과 별도 한도입니다. `src/hwpx/binary_reference_links.zig`는 manifest ID 조회·소유 진단을, `binary_reference_scan.zig`는 XML 경로·한도를, `binary_references.zig`는 두 단계를 조립합니다.

## 실파일·적대적 검증

저장소의 레거시 fixture와 로컬 `edwardkim/rhwp` 클론의 커밋 `e8800c8def63449808a4092798442652ed460552`를 corpus로 사용했습니다. 두 corpus의 `.hwpx` 484개에서 ZIP 거부 6개와 암호화 2개를 제외한 476개, section 544개를 검사했습니다. 인식·미분류 위치 25,549개 중 미분류 속성과 manifest 대상 ID 누락은 모두 0개였습니다. 출처별 실측은 다음과 같습니다.

| 출처 | 위치 | 속성 부재 | 빈 ID | 내장 해결 | 외부 해결 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 헤더 font | 20,446 | 20,445 | 0 | 1 | 0 |
| 헤더 substFont | 2,620 | 0 | 2,620 | 0 | 0 |
| 헤더 이미지 브러시 | 389 | 0 | 0 | 389 | 0 |
| section 그림 | 1,993 | 0 | 41 | 1,945 | 7 |
| section 이미지 브러시 | 1 | 0 | 0 | 1 | 0 |
| section OLE | 100 | 0 | 1 | 34 | 65 |

초기 조사에서는 조건부 `hp:switch/default`의 OLE 93개를 미분류로 발견했습니다. 해당 조상을 모델에 추가한 뒤 재조사에서 미분류가 0개로 내려갔습니다. 이는 corpus에서 관측한 결과이지 조건부 분기 선택의 의미 검증이나 바이너리 내용 검증이 아닙니다. 재현 명령은 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX corpus binary manifest links read-only survey'`입니다. 전체 corpus 테스트 묶음의 완료를 이 단독 실행으로 대신 주장하지 않습니다.

합성 테스트는 XML 문자 참조가 든 ID, 내장·외부 item, 빈 값·속성 부재·대상 누락, 다른 namespace·조상 위장, 조건부 양쪽 분기, 정확한 byte·속성·위치 한도, 암호 문서 선제 거부, 모든 할당 실패와 ReleaseFast 명시적 해제 회계를 검사합니다. Git에 추적된 `sample-5017-pics.hwpx`, `borderfill.hwpx`는 새 기본 테스트에서 직접 검사합니다. 조건부 OLE 실파일은 로컬 `reference/rhwp` corpus의 선택 조사에서 확인했으며 새 기본 테스트에는 의존성으로 넣지 않았습니다. 기존 HWPX 기본 테스트 일부는 여전히 해당 로컬 클론을 사용합니다. 바이너리 payload의 CRC·MIME·실제 이미지/폰트/OLE 복호화, 비section spine·history의 참조, 조건부 분기 선택, 2021/2024 namespace 및 편집·저장은 아직 별도 단계입니다. [차트 XML의 경계 검사](hwpx-chart-references.md)는 별도 API로 제공하며 차트 의미 검증은 하지 않습니다. 이 검사만으로 전체 문서 검증을 완료했다고 보지 않습니다.

독립 소스 복사본에 manifest ID 대신 ZIP 경로로 조회하기, `hp:switch` 분기 경계 제거, 미분류 속성 조용히 버리기, 소유한 첫 미해결 ID 해제 제거의 네 변이를 주입했습니다. 앞의 세 변이는 해당 값·분기·미분류 테스트에서 실패했고 마지막은 ReleaseFast의 할당 실패 검사에서 7바이트 누수를 검출했습니다. 제품 소스에는 변이를 반영하지 않았습니다.

기본 `zig build test`는 2,100/2,100, Debug·ReleaseSafe·ReleaseFast의 `zig build audit --summary all`은 각각 40/40 단계 및 2,139/2,139 테스트를 통과했습니다. `zig build -Doptimize=ReleaseSafe`는 5/5 단계, 기존 JS 비교 테스트는 47/47을 통과했습니다. 선택 corpus 조사는 위의 필터를 단독 실행한 결과이며 전체 선택 조사 묶음의 통과를 뜻하지 않습니다.
