# HWPX 원문 텍스트 조각 편집 기반

## 책임과 SSOT

`text_sites.zig`는 기존 `xml_part_tree.Tree.visitContent`를 재사용하여 정확한 paragraph namespace의 `t` 직접 문자 이벤트와 원본 범위를 연결합니다. 외부 namespace·자식 내부 문자열은 직접 텍스트로 오인하지 않습니다. 텍스트 문자열은 소유 UTF-8이며 source 범위는 정수입니다. CDATA는 전체 delimiter까지 연결합니다. 문자 이벤트가 없는 자식 없는 빈 `t`는 별도 삽입 위치를 만듭니다. 요소별 방문 표식으로 반복 검색을 피하고 마지막에 원문 순서로 정렬합니다. 사이트 수·합계 텍스트 바이트 예산을 적용합니다.

`text_site_edit.zig`는 한 사이트의 현재 텍스트만 변경합니다. UTF-16 단위 위치를 공통 Unicode scalar reader로 UTF-8 경계에 연결하며 surrogate 중간·범위 초과·금지 XML 문자·할당 실패를 성공처럼 처리하지 않습니다. 출력 할당과 복사가 끝난 뒤 현재 텍스트를 교체합니다. 할당자는 사이트 소유 할당자와 같아야 합니다. 원본 정수 범위는 편집 후에도 바꾸지 않습니다.

`text_sites_save.zig`는 원본 트리에서 위치와 원래 텍스트를 임시 재구성하고 현재 사이트의 개수·위치·요소·빈 요소 형태를 대조합니다. 원본 decoded 텍스트의 별도 가변 캐시는 없습니다. 현재 텍스트가 같은 범위는 출력하지 않아 무변경·편집 복원 시 원본 entity·CDATA·태그 형태가 유지됩니다. 검증·출력의 실패는 현재 모델을 변경하지 않습니다.

`xml_source_writer.zig`는 검증된 비중첩 변경 범위 밖 원문을 복사합니다. self-closing 빈 요소의 변경은 기존 XML tag parser로 정확한 QName·속성 원문을 확인해 시작/끝 태그로 펼칩니다. `src/xml/text_writer.zig`는 CharData escaping과 XML 문자 적격성만 소유합니다. `&`·`<`·`>`를 escape하고 CR은 숫자 참조로 출력해 재읽기의 줄바꿈 정규화로 잃지 않습니다. attribute나 CDATA 내부 serializer로 사용하지 않습니다.

## 현재 제한

UTF-8 원문 조각 편집만 지원합니다. UTF-16 XML 편집은 명시적 미지원입니다. 현재 사이트 수집은 raw 모든 분기 관측이며 활성 분기 정책과 문단·run 위치 매핑은 아직 연결하지 않았습니다. 따라서 일반 사용자용 문단 편집 API로 공개하지 않습니다. 텍스트가 없는 run에 새 `t` 생성, 컨트롤 경계 편집, 여러 사이트에 걸친 문단 splice, 줄 조각 재조판, 필드 의미 갱신·보호, 표/이미지 편집·Canvas/WASM 세션은 후속 작업입니다. 기존 lineseg 원값이 유지된다는 것을 새 텍스트에 올바른 조판이라고 해석하지 않습니다.

## 2026-10-01 검증

Debug·ReleaseSafe·ReleaseFast XML 출력 집중 검사 각각 4/4(root 포함)에서 모든 허용 Unicode scalar의 roundtrip, CR·엔티티 주입·CDATA 종료 문자열, 잘못된 UTF-8·잘린 입력·금지 문자, 출력 한도·모든 할당 실패가 통과했습니다. 각 모드의 원문 writer 집중 검사 2/2, 사이트 편집 2/2, 위치 연결·실파일 저장·빈 요소·출력 OOM 검사 6/6도 통과했습니다. ReleaseSafe 제품 WASM 빌드는 5/5 단계, 전체 native 검사는 7/7 단계·2,726/2,726 테스트·종료 코드 0으로 완료됐습니다.

독립 Python ZIP/XML 비교에서 비암호화 추적 HWPX 44개 각각 section0의 첫 사이트에 `검증😀<&`와 CR을 삽입해 저장했습니다. Python 일반·최적화 모드에서 44개/499개 항목의 ZIP CRC·순서·다른 payload·metadata가 같고, 변경 XML은 독립적으로 만든 텍스트 삽입 결과와 같았습니다. XML 주석·PI도 독립 비교에 포함합니다. `borderfill.hwpx`의 빈 self-closing `t` 누락을 먼저 재현한 뒤 구현과 회귀 테스트를 추가했습니다. 파일당 한 곳의 삽입을 전 문단·전 section·활성 분기 편집 지원으로 확대 해석하지 않습니다. 암호화 파일은 제외를 명시하며 복호화 지원은 완료되지 않았습니다.

독립 oracle 자체의 일반·최적화 자체 검사도 통과했습니다. 정상/빈 요소 편집을 허용하고 주석·속성·다른 텍스트 변조, CR 손실, 편집 미반영의 다섯 반례를 거부합니다.

실행 명령은 [개발·검증 명령](development-commands.md), ZIP 출력은 [선택 항목 교체 저장](zip-replacement-writer.md)이 소유합니다.
