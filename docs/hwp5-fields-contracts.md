# HWP5 필드·메모 참조 계약

[모듈 인덱스](hwp5-modules.md) · [과거 공통 기록](hwp5-foundation.md)

[관측 변경 추적 범위 변환](hwp5-revision-projection.md)은 명시적으로 선택하는 UTF-16 바이트 변환의 계약·한도·실파일 검증을 소유합니다. 기본 문서/컨테이너 검사의 자동 적용이나 변경 추적 전체 편집 API와 구분합니다.

이 문서는 해당 주제의 현재 책임·소유권·미지원 경계를 소유합니다. 계약과 새 검증 결과는 해당 주제에서 관리하고, 내용이 커지면 별도 문서로 분리하여 연결합니다.

[메모 범위 진단](hwp5-memo-ranges.md)은 기존 파싱 결과에서 수집한 시작·끝 이벤트의 흐름별 짝과 순서를 소유하며 문서 보고서에 연결합니다. 번호 대상 존재 검사와 구분하고, 범위 진단 자체를 강제 오류로 처리하지 않습니다.

- `body/memo_list.zig`는 태그 93의 u32 메모 번호와 extra를 보존하며 body reader가 재사용합니다. 0/비연속/상위 비트를 정규화하지 않고 번호를 DocInfo 메모 모양 ID나 문단 수로 취급하지 않습니다. payload 잘림은 문서/CFB까지 전파되지만 level 1 소유권·후속 LIST_HEADER·구역 간 필드 연결은 별도 검증 대상입니다. typed payload 분류를 메모 의미 검증 완료로 세지 않습니다.

- `memo_list_header.Header.parse`는 기존 ListHeader의 observed8 view를 재사용해 메모용 signed 32비트 문단 수·속성·u32 텍스트 폭/높이·extra를 소유합니다. Groups.build는 같은 부모의 바로 앞 직접 형제가 MEMO_LIST인 경우에만 이 문맥을 선택하고 Group.memo에 번호 노드/해석한 헤더를 보존합니다. 메모는 음수/전체 32비트 개수를 검사하고 다른 리스트의 u16/opaque 상위 워드 계약은 유지합니다. 메모 표식 누락·중복·문서 전역 필드 연결 검증과 구분합니다.

- `memo_validation.inspect`는 같은 Tree에서 만든 Group.memo를 재사용해 root 문단의 level 1 메모 표식, 표식의 자식 부재, 모든 표식의 후속 리스트 연결을 검사합니다. section에서 호출하므로 고아·미연결 표식 오류가 문서/CFB까지 전파됩니다. markers/paragraphs/extra_bytes는 저수준 구조 보고서이며 아직 section wire에 추가하지 않았습니다. 연속 표식처럼 리스트가 부족한 구조와 동일 번호를 가진 별개 정상 리스트를 구분하며 번호 유일성·필드 전역 연결을 추정하지 않습니다.

- `memo_field.fromField`는 이미 파싱한 공통 필드에서 %%me 또는 %unk+정확한 UTF-16 MEMO/ 표식을 식별하고 선택 u32 메모 번호/extra를 보존합니다. isCommand는 control_identity도 공유합니다. 부재는 null이며 1~3바이트 꼬리는 오류, 0은 존재하는 값입니다. field_validation이 이 경계를 검사하지만 공통 헤더 이후 extra_bytes 집계는 유지합니다. 다른 필드에 MEMO/ 문자열이 있다는 이유만으로 재분류하거나 명령 숫자·전역 참조를 추정하지 않습니다.

- `control_identity.zig`는 exact와 관측 메모/변경 추적 삭제·서명 연결을 구분합니다. code 3과 %unk 헤더에 대해 %%me 토큰은 정확한 UTF-16 MEMO/ 접두사, %%*d 토큰은 `$RevisionDelete;` 전체 명령이 일치할 때만 관측 연결입니다. 각각 memo_field/revision_delete_field가 명령 식별을 소유합니다. 서명의 별도 계약·실측·검증은 [변경 추적 서명 필드](hwp5-revision-sign.md)가 소유합니다. 두 ID는 Link에 그대로 보존하며 다른 불일치를 wildcard로 허용하지 않습니다. `field_start.zig`는 표 152의 공통 속성·command·instance ID·extra를 소유하며 명령을 실행하지 않습니다. 구역 observed_field_links는 관측 종류의 enum 값 합계가 아닌 연결 수입니다. 메모 전체 명령 문법과 변경 추적 적용은 별도입니다.

- `hwp5/memo_references.zig`는 문서 전역 메모 번호 인덱스와 진단을 소유합니다. section은 기존 Group.memo와 field_validation의 파싱 결과에서 번호/구역만 수집하고 document.validation은 모든 구역 검사 후 정렬/대조합니다. 번호 크기로 배열을 할당하지 않습니다. 부재 번호는 null 진단, 알려진 번호의 대상 누락/여러 대상은 오류이며 참조 없는 리스트·중복 필드 번호 자체는 진단입니다. DocInfo 모양/instance ID와 섞지 않고 미참조 리스트의 변경 추적 의미를 추정하지 않습니다. 반환 Report는 scalar 집계만 보유하며 임시 인덱스는 성공/실패 모두 해제합니다. 기존 section wire는 유지하고 테스트 mode 90에서 전역 보고서를 노출합니다.

- `body/memo_end.zig`는 호출자가 선택한 code 4의 12바이트 data 중 관측 표식 0x00256d65와 가운데 미확정 DWORD/메모 번호를 읽습니다. 다른 표식은 null이며 보통 CTRL_HEADER ID와 같다고 가정하지 않습니다. 가운데 원값을 bool/고정값으로 축소하지 않고 0/UINT32_MAX 번호를 보존합니다. Text.Iterator가 토큰 폭·종결자/UTF-16 위치를 소유하며 테스트 mode 91은 이를 재사용합니다. 끝 토큰 해석과 문단 간 필드 범위·전역 메모 참조 검증 연결은 별도입니다.

- `memo_end_collection.zig`는 이미 만든 Tree의 Text.Iterator/memo_end 결과에서 끝 번호를 수집하며, 범위 수집기가 있으면 같은 결과의 원본 위치도 전달합니다. memo_references.Index는 ends와 fields의 출처 목록을 구분하되 하나의 lists 목록과 inspectRows 대조 함수를 공유합니다. document는 헤더 필드 참조 이후 EndReport를 검사해 끝의 대상 누락/모호함을 MissingMemoEndTarget/AmbiguousMemoEndTarget으로 전파합니다. 코드 4 전체를 메모로 추정하거나 문단별 닫힘을 강제하지 않습니다. mode 92는 ends 전용 9개 진단이며 기존 문서 wire는 유지합니다. 끝→리스트 참조와 시작·끝 범위의 짝/순서/중첩 검증은 구분합니다.

- `field_validation.zig`는 control_rules에서 code 3으로 정의한 알려진 필드만 공통 파서로 검사하고 구역 개수·command 길이·속성 진단·꼬리를 집계합니다. '%' 접두사나 요약의 '%%%%'를 wildcard로 쓰지 않습니다. 읽기 전용 수정/수정됨/업데이트 종류는 원시 비트 view이며 실제 권한·링크 상태로 단정하지 않습니다. 전역 instance ID 유일성과 명령 종류별 의미 검증은 별도입니다.
