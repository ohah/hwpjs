# 끝 마커가 없는 필드의 구조적 소유 범위

현재 두 규제분석 원본의 누락 누름틀이 표 셀의 subList 안에 있는데, 외부 입력 보호는 시작 이후 구역 전체에 영향을 줍니다. 관련 거부/원문 진단은 [입력 경로 조사](hwpx-prefix-route-inventory.md)가 소유합니다.

## 현재 구현 경계

`field_source_scope.zig`는 원본 fieldBegin에서 가장 가까운 정확한 paragraph namespace의 subList를 찾고 source 시작~목록 끝의 Envelope를 반환합니다. 없으면 section 루트 끝을 사용합니다. XML namespace는 document_xml의 기존 상수를 재사용하며 parent 순환/범위 밖 인덱스·소스 바이트를 벗어나는 경계를 거부합니다.

이는 구조 범위 계산일 뿐입니다. 끝 마커를 만들거나 링크 진단을 바꾸지 않으며 편집 권한을 부여하지 않습니다. 기존 unmatched 보호와 strict lease는 아직 그대로입니다. 이 모듈의 범위 계산 성공을 해당 문서 편집 성공으로 바꾸지 않습니다.

## 검증

`zig test src/field_scope_regression_test.zig -O ReleaseSafe`는4/4 exit0이며 소유 범위 두 검사와 기존 XML/namespace 두 검사를 포함합니다. 같은 목록의 후속 문단 포함, 형제 셀/바깥 문단 제외, 중첩 목록의 가장 가까운 소유자, foreign subList 무시, end 경계 제외, 잘못된 노드/부모 순환/범위 밖 parent/owner end를 검사했습니다. 수정 파일의 fmt·diff 공백도 통과했습니다.

현재 native 실제 원본 진단1/1 exit0에서 누락 필드5개 모두 셀 소유 범위를 반환하고 원본 저장 byte-exact를 유지했습니다. 독립 XML에서는 두 문서의 정상296/175쌍이 모두 같은 subList 또는 루트 소유자 안에 있었습니다. 이 관측만으로 모든 HWPX 필드의 의미 규칙을 확정하지 않습니다.

## 후속 검증

소유 목록 밖의 일반 입력과 목록 안의 계속 보호를 실제 Session/History/저장·독립 XML로 함께 검사한 뒤 정책 연결을 판단합니다. root 수준 누락·목록을 가로지르는 명시적 링크·교차 소유/중첩 필드·다문단 구조 편집을 별도로 검토해야 합니다. 전체 native/public gate에 이 신규 모듈은 아직 연결되지 않았고 코드 커밋/제품 반영도 하지 않았습니다.
