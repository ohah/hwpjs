# 신규 표 HWPX XML 작성

원본/생성 문단 구분과 현재 삽입 점 검사 단계는 [신규 표 host 참조](hwpx-created-table-anchor.md)를 따릅니다. fragment 작성과 Session 삽입 거래는 별도입니다.

`created_table_xml.write`는 현재 Table 모델에서 독립 namespace를 선언한 `hp:tbl` fragment를 만듭니다. 원본 XML/ZIP을 수정하거나 Session에 삽입하지 않습니다. 생성 정책은 미병합 inline 표·절대 치수·고정 행 높이·수평 셀 내용·TOP 정렬·0여백·반복 header 없음입니다. 원본 표를 이 정책으로 정규화하지 않습니다. 표/셀/문단/글자/서식 참조 값은 모델에서 받고, 텍스트는 기존 `xml/text_writer`가 단독 이스케이프·XML 허용 문자·CR 보존을 소유합니다. 줄 배치 캐시는 만들지 않습니다.

필드명은 실제 table.hwpx와 한컴 공개 모델의 고정 커밋 [TableType.cpp](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/TableType.cpp)·[ParaListType.cpp](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/ParaListType.cpp)와 대조했습니다. 후자는 subList의 id를 문자열로 읽고 쓰며 HORIZONTAL/BREAK/TOP 초기 값을 가집니다. 이 관측을 완전한 XSD/한글 프로그램 호환 검증으로 해석하지 않습니다. 코드를 이식하지 않았습니다.

작성 전에 치수/셀수100000한도·모델 identity·셀 개수·로컬 문단 ID0/중복을 재검사합니다. 출력은 매 append에 바이트 예산을 적용하고 실패 시 임시 버퍼를 해제합니다. 문서 전체 ID 충돌·실제 header 리소스 참조 존재·host 삽입 위치·ZIP 저장은 후속 Session 거래의 책임입니다. 현재 단독 fragment에 가짜 header/기본 리소스를 붙이지 않습니다.

2026-10-11 root 집중 ReleaseSafe3/3·exit0(root 진입+새2테스트)입니다. 생성2×2표를 section/run wrapper에서 다시 읽어 격자 점유·셀 주소/치수·문단 ID/문단/글자/서식 참조·유니코드 및 `<&amp;>]]>`·CR/LF/TAB 텍스트를 대조했습니다. 정확 출력보다1바이트 작은 예산·XML 불가 NUL·중복 ID를 거부하고 모든 writer 할당 실패의 결과/해제를 확인했습니다. 최종 fmt/diff·별도 prefix `/tmp/hwpjs-created-table-xml-20261011` ReleaseSafe build도 exit0입니다. 이는 우리 파서와의 단독 fragment 재해석이며 독립 외부 XML/ZIP·XSD·실제 한글·Session 저장/undo·WASM/Canvas 삽입 성공이나 전체 native gate가 아닙니다. 기본 WASM은 교체하지 않습니다.
