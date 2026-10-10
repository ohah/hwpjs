# 신규 표 host의 현재 문단 참조

2026-10-11 최종 root 집중 ReleaseSafe4/4·exit0(root 진입+새3테스트), fmt/diff·별도 prefix `/tmp/hwpjs-current-paragraph-reference-20261011` ReleaseSafe build exit0입니다. 아직 깨끗한 게시 전체 native gate가 아니며 기본 WASM은 교체하지 않았습니다.

`current_paragraph_reference`는 원본의 source_ordinal과 생성 문단의 generated_id를 서로 다른 tagged namespace로 구분합니다. 원본 XML `hp:p.id`나 재사용 가능한 template_element를 현재 문단 식별자로 쓰지 않습니다. 동일 source/template에서 나온 여러 문단도 현재 output identity로 찾고, 누락·중복·잘못된 조합을 추정하지 않고 거부합니다. joined provenance piece의 멤버를 현재 output 문단 자체로 오인하지 않습니다.

문단 앞에서 분할해 순서가 달라지면 같은 identity의 현재 순번을 다시 계산합니다. 병합으로 identity가 사라지면 MissingCurrentParagraphReference입니다. 실제 삽입 거래의 split/merge가 host identity와 오프셋을 명시적으로 옮겨야 하며 이 조회기만으로 병합 이후 앵커 이동이 완료되지 않습니다. 참조는 전달된 현재 section의 문단 목록 범위입니다.

`created_table_anchor.capture/resolve`는 section·현재 순번/참조·UTF-16 unit을 검증합니다. 기존 plain/joined 위치 어댑터 및 text_site_edit의 surrogate 경계를 재사용하고 별도 문자 길이 계산을 만들지 않습니다. 임시 현재 view와 위치 배열은 요청 내에서 해제합니다. 이것은 검사된 현재 점이지 필드/보호 컨트롤 안 표 삽입 허가·텍스트 변경에 따른 affinity/rebase 구현·Session에 저장된 표 앵커가 아닙니다. 문단 내용이 바뀌면 거래가 unit을 같이 갱신해야 하며, 단순 재검사는 의미 위치 보존을 증명하지 않습니다.

실제 charshape.hwpx에서 원본/생성 identity의 앞 문단 두 번 분할·병합 후 현재 순번 및 retired identity 거부를 검사했습니다. 별도 Unicode 삽입 후 surrogate 내부 capture/resolve 거부·앞 문단 분할 후 동일 host 조회·모든 resolve 할당 실패·잘못된 section/순번/unit/identity 거부·거부 전후 저장 바이트 및 원본 source 불변을 검사합니다. 원본 문서를 쓰지 않습니다. Session 신규 표 소유·저장/undo·공개 API/Canvas 삽입은 아직 후속 단계입니다.
