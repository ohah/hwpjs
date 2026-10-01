# HWPX 머리말·꼬리말 소유 문단 편집

## 계약과 책임

`retained_header_footer.zig`는 정확한 paragraph namespace의 header/footer, 단일 직접 subList와 그 직접 p 자식만 원문 보존 컨테이너로 허용합니다. wrapper·list 사이 source gap은 공통 `element_whitespace_gaps.zig`로 검사하며 숨은 문자·주석·PI·미지 list 자식·외부 namespace·중복 list는 거부합니다. p 내부 의미나 전체 XSD 적합성을 이 모양 검사로 보증하지 않습니다.

`retained_run_metadata.zig`가 해당 컨테이너를 바깥 문단의 편집 가능한 텍스트 위치에서는 0단위로 유지합니다. 중첩 p는 기존 section scanner의 별도 순번·현재 Sites·공유 거래를 사용합니다. 중첩 텍스트를 평탄화하거나 새 ordinal 구현을 만들지 않습니다. 머리말 안 자동 번호는 기존 보호 앵커 API가 소유합니다.

기존 Session·WASM·JS의 plain 및 anchored 명령을 재사용하며 새 ABI나 편집 캐시를 만들지 않습니다. 변경된 텍스트 조각만 저장하고 header/footer·subList 속성과 미지원 데이터는 원문을 유지합니다. 위치는 편집 projection의 계약이며 HWP5 원시 컨트롤 너비와 동일하지 않습니다.

`header_footer_edit_tests.zig`는 native 소유·모양·실패 경계를, `tests/hwpx/header-footer-editor.test.mjs`는 공개 실제 파일 편집과 독립 Python XML/ZIP 비교를 소유합니다.

한컴 고정 버전 [HeaderFooterType 모델](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/HeaderFooterType.cpp)의 subList 연결과 id·applyPageType 속성을 직접 대조했습니다. 단일 list 허용은 현재 편집 적격성 범위이지 공식 모델의 모든 자식 수 제약을 증명한 것이 아닙니다. 속성 원문은 보존하지만 적용 쪽을 새로 계산하거나 바꾸지 않습니다.

## 검증 기록

2026-10-02 Debug·ReleaseSafe·ReleaseFast 집중 검사 각각 3/3에서 바깥 BODY와 중첩 HEAD/FOOT의 세 소유를 별도로 수정하고 모든 할당 실패의 정리·첫 거래 실패 전 현재 상태 보존을 검사했습니다. subList 부재·중복·숨은 gap·미지 자식·외부 namespace 반례를 거부했습니다.

ReleaseSafe 제품 빌드 5/5와 공개 실제 headerfooter.hwpx 검사 1/1이 통과했습니다. 순번 2의 빈 바깥 문단, 순번 3의 자동 번호 포함 머리말, 순번 4의 꼬리말에 순차 prefix를 삽입하며 다른 문단이 변하지 않는지 확인했습니다. Python 일반·최적화의 전체 XML tag/attribute/text/tail/자식 순서 및 다른 ZIP payload 비교, prefix 제거 후 원본 ZIP 바이트 복원, 저장 결과 재열기·재저장이 통과했습니다. 독립 비교기 자체도 저장 ZIP의 header id·footer 본문·편집 대상 밖 첫 본문을 각각 손상시키는 세 반례를 두 Python 모드 모두에서 거부했습니다.

최신 제품 HWPX 25/25·HWP5 편집 69/69·빌드 각각 7/7, Worker 집중 5/5가 통과했습니다. Worker는 실제 빈 소유 문단의 입력·제거·표시 복원도 검사합니다. 일반 전수는 45파일·암호화 1개·1379문단 중 1174성공·컨트롤 거부 157·숫자 입력 조건 거부 48이며, anchored 전수는 157후보 중 137성공·20거부입니다. 소유 문단 1개가 일반 편집으로 승격됐고 남은 anchored 거부는 계산 결과 13개·필드 마커 문단 7개입니다. 기존 재계산·제한적 필드 라벨 경로와 구분합니다.

실제 외부 Chromium에서 포인터로 빈 바깥 문단에 `소유😀`, 머리말에 `머리😀`, 꼬리말에 `꼬리😀`를 순차 입력했습니다. 각 입력값·적용 상태와 `/private/tmp/hwpjs-header-footer-e2e.png`를 직접 관찰해 세 문단·머리말 번호 표식을 확인했습니다. agent-browser 입력이며 OS IME·원본 쪽 영역 배치 증명은 아닙니다. 문서 링크 3036개 누락 0·도구 반례 2/2·diff 검사도 통과했습니다.

최신 전체 ReleaseSafe native 회귀는 종료 코드 0·2789/2789 테스트·빌드 7/7로 완료됐습니다. 머리말·꼬리말 생성/삭제·적용 쪽 속성 변경·실제 쪽 영역 배치와 RHWP 수준 UI·원본 조판은 미완료입니다. [일반 문단 계약](hwpx-plain-paragraph-edit.md)과 [개발·검증 명령](development-commands.md)을 함께 읽습니다.
