# 끝 마커가 없는 필드의 구조적 소유 범위

현재 두 규제분석 원본의 누락 누름틀이 표 셀의 subList 안에 있는데, 외부 입력 보호는 시작 이후 구역 전체에 영향을 줍니다. 관련 거부/원문 진단은 [입력 경로 조사](hwpx-prefix-route-inventory.md)가 소유합니다.

## 현재 구현 경계

`field_source_scope.zig`는 원본 fieldBegin에서 가장 가까운 정확한 paragraph namespace의 subList를 찾고 source 시작~목록 끝의 Envelope를 반환합니다. 없으면 section 루트 끝을 사용합니다. XML namespace는 document_xml의 기존 상수를 재사용하며 parent 순환/범위 밖 인덱스·소스 바이트를 벗어나는 경계를 거부합니다.

Envelope 자체는 구조 범위 계산일 뿐이며 끝 마커를 만들거나 링크 진단을 바꾸지 않습니다. 후속 로컬 검증 구현에서 field_source_outside_positions의 unmatched 보호를 이 Envelope에 연결했습니다. strict lease와 정상 명시적 링크는 그대로입니다. 셀 목록 안의 이후 내용은 계속 보호하고 루트 시작은 계속 section 끝까지 보호합니다. 이 연결은 아직 제품/코드 커밋에 반영하지 않았습니다.

## 검증

`zig test src/field_scope_regression_test.zig -O ReleaseSafe`는4/4 exit0이며 소유 범위 두 검사와 기존 XML/namespace 두 검사를 포함합니다. 같은 목록의 후속 문단 포함, 형제 셀/바깥 문단 제외, 중첩 목록의 가장 가까운 소유자, foreign subList 무시, end 경계 제외, 잘못된 노드/부모 순환/범위 밖 parent/owner end를 검사했습니다. 수정 파일의 fmt·diff 공백도 통과했습니다.

현재 native 실제 원본 진단1/1 exit0에서 누락 필드5개 모두 셀 소유 범위를 반환하고 원본 저장 byte-exact를 유지했습니다. 독립 XML에서는 두 문서의 정상296/175쌍이 모두 같은 subList 또는 루트 소유자 안에 있었습니다. 이 관측만으로 모든 HWPX 필드의 의미 규칙을 확정하지 않습니다.

## 후속 검증

연결 전 합성 Session은 before=true/inside=false/continuation=false/sibling=false/after=false로 실패를 재현했습니다. 연결 후 sibling/after만true가 됐고 나머지 보호는 그대로입니다. 두 Session 집중 검사 각각1/1 exit0은 형제 셀/바깥 본문 입력·저장·두 번 undo 원문/redo 수정본 복원·목록 안 거부 후 저장 불변 및 루트 누락의 후속 목록/본문 보호를 확인했습니다. 정규 root에도 새 Session 검사를 등록했지만 이전 실행 중 전체 gate의 바이너리에는 이 정책 변경이 포함되지 않습니다. 별도492개 의존 회귀는 실행 중이며 아직 최종 결과가 없습니다.

새 field-scope-exterior 후보 SHA256 `30ec69f9d2c7b85af43106f92e5c4fc1edd54a29715ed4c6a9717656e229a154`는 ReleaseSafe build6/6 exit0입니다. 실제 두 원본 query-only 재검사에서80168은 plain3740/anchored184·거부240,86712는 plain1935/anchored84·거부82입니다. 기존 거부3982+1719=5701에서322로 줄었지만 두 도구는 여전히 exit1이며 전체 성공으로 바꾸지 않습니다. strict 필드 조회/편집과 빈 사이트의 잔여 원인은 추가 작업입니다.

원래 거부 위치 중 새로 canEdit가 허용된 실제189/399번을 각각 prefix 입력했습니다. 독립 전체 XML/ZIP normal/-O·잘못된 기대값 거부·undo 원문 byte-exact·redo 수정본·재열기/재저장·원본 파일 불변이 모두 확인됐습니다(`/tmp/hwpjs-field-scope-actual-edits.log`). 이는 두 문단 실제 편집이지 새5379경로 모두의 실제 편집 완료가 아닙니다. 원문 연결 마커를 보정하거나 누락 내용을 편집하지 않았습니다.

목록을 가로지르는 명시적 링크·교차 소유/중첩 필드·다문단 구조 편집·전체 할당 실패·최신 전체 native/public·실제 Worker/Canvas를 추가 검토해야 합니다. 기존 역할 후보 전체 실행을 이 이후 정책 변경의 전체 gate로 소급하지 않으며 코드 커밋/제품 반영도 보류했습니다.
