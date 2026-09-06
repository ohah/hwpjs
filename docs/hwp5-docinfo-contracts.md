# HWP5 DocInfo·리소스 계약

[모듈 인덱스](hwp5-modules.md) · [과거 공통 기록](hwp5-foundation.md)

이 문서는 해당 주제의 현재 책임·소유권·미지원 경계를 소유합니다. 계약과 새 검증 결과는 해당 주제에서 관리하고, 내용이 커지면 별도 문서로 분리하여 연결합니다.

- `docinfo/memo_shape.zig`는 관측 태그 92의 22바이트 payload 코어입니다. 폭 u32/테두리 6바이트/채우기·활성 색상 u32/마지막 미확정 u32와 extra를 보존합니다. `border_line.Border.read`를 border_fill과 공유하되 메모와 일반 테두리의 enum 의미까지 같다고 가정하지 않습니다. 마지막 DWORD의 실제 1/2를 기본 0으로 바꾸거나 memoType 의미를 확정하지 않습니다. DocInfo reader는 payload와 level 1을 검사하고 resources는 memo_shape_count를 집계합니다. 실제 ID 매핑 슬롯이 있을 때만 음수/개수 불일치를 검사하며 슬롯 부재를 0으로 보충하지 않습니다. 본문 메모 참조·메모 명령의 의미 검증은 별도입니다.

- `src/hwp5/docinfo/`: 문서 속성·ID 매핑·BinData·FaceName·TabDef·Numbering·Bullet·Style payload와 태그 dispatch·리소스 개수 검증을 분리합니다. 번호/글머리표의 공통 머리 정보는 `paragraph_head.zig`가 소유합니다. 실제 필드 부재(null)와 값 0, 버전상 기대 슬롯 수를 구분합니다. BinData/글꼴 개수 검증과 전체 문서 조립/참조 검증을 혼동하지 않습니다.

- `BinData.target`은 embedding/storage의 파일 ID·확장자·꼬리 해석을 소유합니다. 기존 parse의 명세 envelope/extra는 바꾸지 않습니다. container.storage_layout 기본 observed_optional_extension은 storage 꼬리 부재를 허용하지만 존재하는 counted prefix가 잘리면 오류입니다. specified는 storage 꼬리를 확장자로 읽지 않습니다. paths.binary의 길이·문자·정확한 경로 규칙을 재사용하며 다른 이름으로 재검색하지 않습니다.

- `docinfo/compatible_document.zig`는 대상 프로그램 원값/미지 enum, `layout_compatibility.zig`는 다섯 DWORD와 꼬리를 소유합니다. reader의 태그 30/31 dispatch와 레벨 0/1 검사가 SSOT입니다. 레이아웃 비트 의미는 명세에 정의되지 않아 자동 보정하거나 유효값 마스크를 추정하지 않습니다.

- `docinfo/compatibility_owner.zig`는 최근 level 0 루트가 compatible_document인지 추적합니다. document/docinfo가 이를 연결해 고아 layout을 거부합니다. 중간 level 1/2 레코드를 새 루트로 오인하지 않으며 개별 payload reader에 문서 전체 상태를 넣지 않습니다.

- `src/hwp5/docinfo/resources.zig`: 주요 리소스 실측 개수와 ID 매핑 비교. `reference_rules.zig`는 ID 기준/부재 값, `references.zig`는 활성 참조 순회·진단을 소유합니다. `validateKnown()` 성공을 전체 문서 유효성으로 해석하지 말고 deferred/unknown_records와 미검증 범위를 확인합니다.

- `src/hwp5/docinfo/border_fill.zig`, `fill.zig`, `char_shape.zig`, `para_shape.zig`: 테두리·채우기·글자·문단 모양을 분리합니다. 그림 정보의 5바이트 배치는 `picture_info.zig`에서 글머리표와 공유합니다. 미지의 채우기 비트는 후속 필드 순서를 추정하지 않고 원본 보존합니다.
