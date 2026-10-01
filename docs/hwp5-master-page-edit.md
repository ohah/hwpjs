# HWP5 바탕쪽 목록의 제한적 텍스트 편집

구역 정의의 직접 LIST_HEADER와 형제 PARA_HEADER를 바탕쪽 목록으로 연결합니다. 바탕쪽 적용 순서·홀짝/확장 상속·페이지 렌더링·HWPX 편집은 이 계약의 범위가 아닙니다.

`body/master_page.zig`는 공식 구역 정의 표 137의 10바이트 영역을 소유합니다. 폭·높이 u32, 텍스트/번호 참조 u8을 원값으로 읽고 이후 확장 바이트는 입력을 빌려 보존합니다. 미지 참조값·0 크기를 임의 보정하거나 조판 유효성으로 판정하지 않습니다. 필수 prefix가 잘리면 UnexpectedEnd입니다.

`edit/paragraph_owner.zig`는 기존 Groups의 목록 문단 수/소유 검사 후 secd의 부모가 root 문단인지 확인하고 기존 SectionDef.parse를 호출합니다. observed8 목록 view 뒤 영역을 위 파서로 검사합니다. 도형 Caption.parse를 재사용하지 않고 원본 트리를 평탄화하지 않습니다. 문서 전체 구역 의미 검증·리소스 참조 검증을 추가했다고 주장하지 않습니다.

실제 table-bug 문단 1의 LIST_HEADER는 34바이트, 선언 문단 수 1이며 root 문단 → secd 아래 level 2 목록/문단 형제입니다. RHWP의 body_text.parse_master_pages_from_raw도 공통 8바이트 뒤 10바이트 영역을 읽습니다. 제품은 RHWP의 잘림 기본값 fallback이나 적용 순서 휴리스틱을 복제하지 않습니다.

제품 WASM으로 기존 빈 바탕쪽 문단에 `바탕😀`를 입력하고 전체 Section·비대상 스트림을 독립 Node oracle로 대조했습니다. ReleaseSafe 편집 검사 60개가 통과했습니다. 필수 prefix 모든 0~9바이트 잘림, 극단 참조값 원형, extra 보존과 0 크기 원값은 native 집중 root 포함 2개 검사로 확인했습니다.

실제 table-bug에서 파생한 목록 payload 17바이트(필수 영역 1바이트 잘림), 선언 문단 수 증가, 목록 헤더 부재는 각각 UnexpectedEnd·ListParagraphCountMismatch·OrphanListParagraph로 거부됩니다. 실패 후 대상 텍스트와 byte-exact 원본 저장을 대조했습니다. 캡션과 바탕쪽을 함께 검사한 중첩 집중 14개 및 ReleaseSafe 제품 편집 63개가 통과했습니다.

추적 문단 전수 검사는 1,481개 중 1,304개 실제 삽입 성공이며 중첩 소유 거부는 0개입니다. 남은 SectionControl 175개·CrossParagraphField 2개 및 HWPX 공개 편집 미연결은 완료로 간주하지 않습니다. 바탕쪽 변경 후 전체 native 회귀 2,696개가 통과했고, 후속 계산식 준비까지 포함한 ReleaseSafe 전체 2,703개와 제품 편집 63개도 통과했습니다. 실제 브라우저의 바탕쪽 입력은 아직 미검증이며 앞선 캡션 단계의 전체 2,695개 통과와 구분합니다.
