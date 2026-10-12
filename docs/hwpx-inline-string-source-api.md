# 원본 인라인 문자열 조회 API

## 계약

`editor.inlineStringSources()`는 optional `hwpx_edit_inline_string_sources` ABI를 호출합니다. 기존 inline_string_controls 파서를 재사용하며 반환값은 `sourceOnly: true`, `controls`, `texts`입니다. controls의 first_text/text_count로 texts를 연결하고, texts의 kind는 main_text/sub_text 또는 first_key/second_key를 구분합니다. 문자열·속성·원문 XML·소스 요소/부모 식별자는 원본 값이며 현재 문단 순번이나 편집 권한이 아닙니다.

pos_type/sz_ratio/option/style_id_ref/alignment는 원문 문자열 또는 null을 유지합니다. 예를 들어 sz_ratio의 `"0"`과 필드 부재 null은 다릅니다. ABI가 없으면 HwpxInlineStringSourcesAbiUnavailable로 거부하며 빈 데이터로 대체하지 않습니다. UTF-8 JSON 문자열 raw_xml을 사용하는 이 패킷은 UTF-8 원문만 지원하고, 다른 원문 인코딩은 UnsupportedSourceEncoding으로 거부합니다. 코어 원문 파서 전체의 인코딩 지원 범위를 이 새 패킷과 혼동하지 않습니다.

조회는 원본 트리에서 detached 보고서를 만들어 출력 버퍼만 소유합니다. 현재 편집 모델/이력에는 설치하지 않습니다. main/sub 내부 편집·현재 소유 위치/배치·Canvas 렌더링은 후속 작업이며 sourceOnly 데이터를 현재값처럼 사용하면 안 됩니다.

## 검증

ReleaseSafe 후보 빌드6/6 exit0, SHA256 `7b22c4dfc3bc80b2a4d81a509fa1edd61da83ebc62c3dbc33ee8581bb9006887`입니다. source-reference2사례와 wire1사례 합계3/3 exit0에서 실제 덧말 본문/주석·0값 보존·반복 조회/클라이언트 변조 격리·본문 입력 뒤 원본 보고서 유지·조회 후 undo/redo·optional export 제거 반례·모든 잘린 JSON 길이·잘못된 소유권/인덱스/종류/수치형 거부를 확인했습니다.

native source 보고서 집중1/1 exit0은 합성 입력의 helper/기존 파서 전체 실패 할당과 원본 불변을 검사했습니다. 실제 WASM 강제 OOM·출력 한도/비 UTF-8 패킷·다른 인라인 문자열 corpus는 별도 검증이 남습니다. 전체 fmt와 기본 등록 누락 검사도 통과했습니다. native ABI는 전체 gate 완료 전 로컬 상태이며 제품 WASM을 승격하지 않았습니다.
