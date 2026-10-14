# HWP5 페이지 코퍼스 현재 검증

## 2026-10-15 실측

`tools/hwp5-page-layout-corpus-audit.mjs`를 최신 검증 산출물 `zig-out/verification/current-fixture-editor-20261015/bin/hwpjs.wasm`로 실행했습니다. SHA-256은072def35c7e1ea5bc93682c996e9d9d69c4b12a63284b59272c10a5148925fe5입니다. Git 추적 문서101경로에서 실제 CFB 시그니처55경로를 선택했으며 ZIP/HWP3는 이 검사 범위가 아닙니다.

| 정책 | 조회 | 완전 배치 | 부분 배치 | 미지원 | 조회 실패 | 입력 불변 |
|---|---:|---:|---:|---:|---:|---:|
| 기본 읽기 | 55 | 42 | 0 | 13 | 0 | 55 |
| 명시적 배포문서 편집 허용 | 55 | 43 | 0 | 12 | 0 | 55 |

두 실행 모두 exit0이지만 이 도구의 exit0은 조회 실패가 없다는 의미이며 페이지 미지원이 없다는 뜻이 아닙니다. 측정값은 고정8px/grapheme이고 원본 한글 조판·실제 글꼴·모든 편집 명령 지원 증거가 아닙니다. Git에 없는 참조 픽스쳐도 이55경로의 범위에 포함하지 않습니다.

## 중복과 남은 원인

파일 SHA-256으로 분류하면55경로는48고유 바이트입니다. noori의8경로(legacy 루트·core fixture·docs demo·node·React Native Android/iOS/공통·web)는 모두 동일합니다. 중복으로 미지원 개수를 부풀리지 않으면 기본 정책은48고유 문서 중42배치/6미지원, 배포 허용은43배치/5미지원입니다. 어느 경로도 삭제하지 않았습니다.

기본 미지원 오류는 IncompleteTableSources9경로, MissingHwp5PageSources2경로, UnsupportedHwp5SectionExtension1경로, UnsupportedMixedInlineTable1경로입니다. noori의 표20/81은 unknown TABLE flags가 각각168102720/168296208이고 chart의4표는33554432(bit25)가 남습니다. software는 구역 확장 nonzero17바이트, table-bug는 미지원 표453을 포함하는 혼합 경로입니다. 미지 비트를 지우거나 기본값으로 해석하지 않았습니다.

배포 허용 실행은2개 파일에 실제 정책을 적용했고 IncompleteTableSources10/SectionExtension1/MixedInlineTable1경로가 남았습니다. 기본 정책의 배포 파일에 페이지 소스가 없다는 결과를 원본 파일에 용지 정보가 없다는 의미로 해석하지 않습니다. 다음 단계는 소스 필드·버전·원본 레코드와 독립 파서의 대조입니다.

## noori 원본 플래그의 독립 대조

같은072def35 WASM의 공개 tableLayoutSources와 독립 CFB.js/Node framing·inflate 결과를 비교했습니다. FileHeader 버전은0x05000300(5.0.3.0)입니다. 다섯 TABLE의 flags/rows/columns가 모두 원본 payload의 offset0/4/6과 일치했고 조회 후 저장 바이트도 원본과 같았습니다.

문제의 첫 TABLE(record20/control19)의 원본 앞20바이트는 `4c0b050e03000400000000000000000000000200`, flags=0x0e050b4c,3행4열입니다. 두 번째 TABLE(record81/control80)은 `1cff070e0100010000008c008c008c008c000100`, flags=0x0e07ff1c,1행1열입니다. 이후 세 TABLE은0x04000006이며 각각1×2/1×3/8×3입니다. Worker의 tableNode20/81은 TABLE 레코드 identity이고 공개 원본 source의 table_node19/80은 control identity이므로 혼동하지 않습니다.

이 필드의 미지원 값은 독립 추출과도 일치하므로 이번 증거에서 Zig의 버전별 flags 오프셋 오독으로 분류하지 않습니다. 파일 전체의 올바름이나 미지 비트 의미까지 증명한 것은 아닙니다. 의미가 확인되지 않은 비트를 삭제해 레이아웃을 통과시키지 않았습니다.

해당 대조를 `tests/hwp5/table-unknown-flags-source.test.mjs`로 고정했습니다. 원본 다섯 TABLE 값·독립 부모 control 소유 관계·tag/id·rows/columns·bit25를 바꾼 기대값의 거부·조회 후 원본 바이트 저장을 확인했고 최신 후보1/1이 통과했습니다. editor API gate에 등록했으며 이는 편집 명령 전수나 페이지 미지원 해소 검사가 아닙니다.

## RHWP 코드 비교 경계

현재 로컬 참조 `reference/rhwp/src/parser/control.rs`의 parse_table_record는 raw_table_record_attr에32비트 전체를 보존하고 page_break는하위2비트, repeat_header는bit2에서 분리합니다. `model/table.rs`는 원본 속성과 extra 바이트를 별도 필드로 보관합니다. `serializer/control.rs`의 serialize_table_record는 원본 attr가0이 아니면 그 값을 우선 쓰고0이면 페이지 나눔·제목 반복에서 재구성합니다. 이는 모든 미지 비트의 조판 의미를 해석했다는 증거가 아닙니다.

HWPX 변환의 `document_core/converters/hwpx_to_hwp.rs` materialize_table_record_attr는 page_break/repeat_header/noAdjust와 관측bit26으로 별도 값을 재구성합니다. 따라서 원본 HWP5 보존 경로와 HWPX→HWP5 변환 경로의 보존 수준을 동일하게 가정하지 않습니다. 소스 코드 비교이며 이번 턴에서 RHWP 실행 결과·원본 한글 화면·변환 무손실을 검증한 것은 아닙니다. 코드를 복사하거나 우리 미지 비트 거부 정책을 완화하지 않았습니다.
