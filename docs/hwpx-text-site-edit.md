# HWPX 원문 텍스트 조각 편집 기반

## 책임과 SSOT

`Sites.clone`은 source 바인딩·빈 요소·missing_text·anchor_boundary와 소유 텍스트의 deep-copy를 단일 구현으로 제공합니다. 일반 텍스트 거래와 계산 필드 거래가 같은 복사를 사용합니다. 실패 시 복사본만 해제하고 현재 텍스트와 원문 바인딩은 바꾸지 않습니다. 이 복사 기반만으로 실행 취소·다시 실행이 구현됐다고 해석하지 않습니다. 별도 native 체크포인트는 Sites와 field_dirty를 함께 소유해야 하며 JS 표시 캐시는 복원 모델이 될 수 없습니다.

`text_sites.zig`는 기존 `xml_part_tree.Tree.visitContent`를 재사용하여 정확한 paragraph namespace의 `t` 직접 문자 이벤트와 원본 범위를 연결합니다. 외부 namespace·자식 내부 문자열은 직접 텍스트로 오인하지 않습니다. 텍스트 문자열은 소유 UTF-8이며 source 범위는 정수입니다. CDATA는 전체 delimiter까지 연결합니다. 문자 이벤트가 없는 자식 없는 빈 `t`는 별도 삽입 위치를 만듭니다. 요소별 방문 표식으로 반복 검색을 피하고 마지막에 원문 순서로 정렬합니다. 사이트 수·합계 텍스트 바이트 예산을 적용합니다.

`text_site_edit.zig`는 한 사이트의 현재 텍스트만 변경합니다. UTF-16 단위 위치를 공통 Unicode scalar reader로 UTF-8 경계에 연결하며 surrogate 중간·범위 초과·금지 XML 문자·할당 실패를 성공처럼 처리하지 않습니다. 출력 할당과 복사가 끝난 뒤 현재 텍스트를 교체합니다. 할당자는 사이트 소유 할당자와 같아야 합니다. 원본 정수 범위는 편집 후에도 바꾸지 않습니다.

`text_sites_save.zig`는 원본 트리에서 위치와 원래 텍스트를 임시 재구성하고 현재 사이트의 개수·위치·요소·빈 요소 형태를 대조합니다. 원본 decoded 텍스트의 별도 가변 캐시는 없습니다. 현재 텍스트가 같은 범위는 출력하지 않아 무변경·편집 복원 시 원본 entity·CDATA·태그 형태가 유지됩니다. 검증·출력의 실패는 현재 모델을 변경하지 않습니다.

`xml_source_writer.zig`는 검증된 비중첩 변경 범위 밖 원문을 복사합니다. self-closing 빈 요소의 변경은 기존 XML tag parser로 정확한 QName·속성 원문을 확인해 시작/끝 태그로 펼칩니다. `src/xml/text_writer.zig`는 CharData escaping과 XML 문자 적격성만 소유합니다. `&`·`<`·`>`를 escape하고 CR은 숫자 참조로 출력해 재읽기의 줄바꿈 정규화로 잃지 않습니다. attribute나 CDATA 내부 serializer로 사용하지 않습니다.

활성 분기는 기존 `xml_tree_selection`·`compatibility_selection` 정책을 재사용합니다. 기본 raw 관측과 selected 관측을 구분하고 저장도 같은 정책으로 원본 사이트를 재구성합니다. 비활성 분기는 XML 원문으로 보존합니다. `hp:t` 하위의 동명 run·t·문단은 inline 컨트롤이므로 새 텍스트 소유자로 만들지 않습니다.

`text_site_locations.zig`는 기존 section 스캐너의 이벤트와 트리의 정확한 태그 위치를 연결합니다. `section_text.scanSource`는 기존 package 스캔과 공유하며 번호 규칙을 복제하지 않습니다. `build`는 단일 section의 번호를 반환하고 `buildWithCounters`는 spine 순서의 누적 report를 공유해 공개 문서 전체 paragraph/run/text 번호에 맞춥니다. 카운터는 모든 위치 연결·할당 성공 후에만 갱신합니다.

실제 빈 run에는 원본 run 위치를 가진 `missing_text` 사이트를 만듭니다. 저장 시 기존 run QName의 접두부로 새 `t`를 생성하고 run 속성·주석을 보존합니다. 빈 run 사이트의 원본 text ordinal은 0이며, 삽입 후 실제 XML을 재읽으면 새 text ordinal이 생깁니다. 비-whitespace 직접 데이터가 있는 run은 빈 run으로 간주하지 않습니다. 이 바인딩을 원본에 없는 text ordinal처럼 UI에 노출하지 않습니다.

## 현재 제한

UTF-8 원문 조각 편집만 지원합니다. UTF-16 XML 편집은 명시적 미지원입니다. 활성 분기·문단 위치·빈 run 연결은 native 기반입니다. 여러 사이트에 걸친 제한적 splice는 [일반 문단 편집](hwpx-plain-paragraph-edit.md), 공개 연결은 [native 편집 세션](hwpx-editor-session.md), 보호 개체의 빈 run 입력 경계는 [앵커 위치](hwpx-anchor-text-positions.md)가 소유합니다. 줄 조각 재조판·표/이미지 객체의 구조 편집은 미완료입니다. 기존 lineseg 원값이 유지된다는 것을 새 텍스트에 올바른 조판이라고 해석하지 않습니다.

## 2026-10-01 검증

아래 2,726개 전체 검사 및 사이트 6개 기록은 첫 조각 편집 단계의 완료 근거입니다. 이후 활성 분기·누적 위치·빈 run 구현의 전체 검사는 별도로 완료 결과를 기록하며 앞선 수치를 최신 전체 결과로 사용하지 않습니다.

활성 분기·누적 위치·빈 run·일반 문단 기반을 포함한 최신 전체 ReleaseSafe native 검사는 7/7 단계·2,734/2,734 테스트·종료 코드 0으로 완료됐습니다. 새 테스트 helper의 변수/함수 이름 충돌로 컴파일이 거부된 실행은 실패로 분리했고 이름 수정 후 새 전체 실행으로 검증했습니다.

이후 Debug·ReleaseSafe·ReleaseFast의 위치/저장 집중 검사는 각각 11/11을 통과했습니다. 선택 분기의 비활성 원문 보존·정책 불일치, inline 내부 동명 문단 오인 재현/수정, section 누적 번호·실패 시 카운터 보존, 빈 run 생성·원본 복원·모든 저장 할당 실패·직접 데이터가 있는 run의 오인 방지를 포함합니다. ReleaseSafe 공개 텍스트/읽기 전용 Canvas audit은 7/7 테스트·7/7 단계로 통과했습니다. 빈 run을 포함한 최신 파일별 편집·독립 비교도 Python 일반·최적화 모드의 44개/499개 항목에서 통과했습니다.

Debug·ReleaseSafe·ReleaseFast XML 출력 집중 검사 각각 4/4(root 포함)에서 모든 허용 Unicode scalar의 roundtrip, CR·엔티티 주입·CDATA 종료 문자열, 잘못된 UTF-8·잘린 입력·금지 문자, 출력 한도·모든 할당 실패가 통과했습니다. 각 모드의 원문 writer 집중 검사 2/2, 사이트 편집 2/2, 위치 연결·실파일 저장·빈 요소·출력 OOM 검사 6/6도 통과했습니다. ReleaseSafe 제품 WASM 빌드는 5/5 단계, 전체 native 검사는 7/7 단계·2,726/2,726 테스트·종료 코드 0으로 완료됐습니다.

독립 Python ZIP/XML 비교에서 비암호화 추적 HWPX 44개 각각 section0의 첫 사이트에 `검증😀<&`와 CR을 삽입해 저장했습니다. Python 일반·최적화 모드에서 44개/499개 항목의 ZIP CRC·순서·다른 payload·metadata가 같고, 변경 XML은 독립적으로 만든 텍스트 삽입 결과와 같았습니다. XML 주석·PI도 독립 비교에 포함합니다. `borderfill.hwpx`의 빈 self-closing `t` 누락을 먼저 재현한 뒤 구현과 회귀 테스트를 추가했습니다. 파일당 한 곳의 삽입을 전 문단·전 section·활성 분기 편집 지원으로 확대 해석하지 않습니다. 암호화 파일은 제외를 명시하며 복호화 지원은 완료되지 않았습니다.

독립 oracle 자체의 일반·최적화 자체 검사도 통과했습니다. 정상/빈 요소 편집을 허용하고 주석·속성·다른 텍스트 변조, CR 손실, 편집 미반영의 다섯 반례를 거부합니다.

실행 명령은 [개발·검증 명령](development-commands.md), ZIP 출력은 [선택 항목 교체 저장](zip-replacement-writer.md)이 소유합니다.
