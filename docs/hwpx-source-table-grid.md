# 원본 HWPX 직사각형 표 격자 후보

`src/hwpx/source_table_grid.zig`의 `prepare(allocator, source_section_xml, request)`는 호출자가 해제할 새 구역 XML만 반환한다. 구역 준비와 저장 ZIP 어댑터는 서로 분리하며, 열린 세션·이력 연결은 [live 편집 계약](source-table-grid-live-edit.md)을 따른다. 배포 상태는 각 검증 근거와 구분한다. 이 후보의 검증을 원본 표 편집의 제품 지원 완료로 읽지 않는다.

입력은 현재 구역 트리의 `tbl` 요소 번호 또는 시작부터 닫는 태그 끝까지의 정확한 바이트 범위, 예상 행·열 수, 행/열 삽입·삭제 명령, 새 셀의 문단 ID다. 요소 번호와 범위는 현재 입력에만 유효하며 영구 ID가 아니다. 예상 크기는 오래된 크기를 거부하지만 같은 크기의 다른 원본을 검출하는 내용 지문은 아니다. 전체 문서의 모든 part를 조사해 신선한 ID를 공급하는 책임은 호출자에게 있다. 모듈은 해당 구역의 모든 문단과 새 ID의 중복 및 새 ID 0을 추가로 거부한다.

좌표는 공유 `model/table_grid_edit_plan.zig`에서 계획한다. 새 셀은 직전 행/열의 셀을 복제하고 삽입 인덱스가 0이면 첫 행/열을 복제한다. 복제한 셀의 문단 ID를 교체하고 `t` 내부를 비운다. 셀·subList·문단·run의 지원하는 원본 서식과 namespace 선언은 유지한다. 빈 self-closing `t`도 그대로 사용할 수 있다. 생존 셀은 `cellAddr` 외의 원문 XML·본문·문단 ID·크기를 유지한다.

크기는 이 후보의 편집 정책이다. 각 열의 폭은 행에 걸쳐 같고 각 행의 높이는 열에 걸쳐 같아야 하며 모두 양수다. `sz`의 폭·높이는 각 열 폭·행 높이의 합과 정확히 같고 ABSOLUTE여야 한다. 셀 간격은 부재 또는 0만 수용한다. 삽입은 복제한 열 폭/행 높이만큼 전체 폭/높이를 늘리고, 삭제는 제거한 열 폭/행 높이만큼 줄인다. 생존 셀을 재분배하지 않는다. 이 정책은 파일 포맷이 요구하는 편집 규칙이라는 주장이 아니다.

지원 입력은 모든 span이 1×1이고 주소가 행 우선 순서와 일치하는 완전한 격자다. 각 셀은 단일 subList, 단일 p와 하나 이상의 지원 plain run/t를 가져야 한다. 빈 run도 허용한다. 구조 요소의 직접 비공백 문자, 줄 캐시, 필드, 중첩 표, 조건 분기, caption/cellzone 및 처리하지 못하는 자식 구조를 거부한다. table의 알려지지 않은 속성은 그대로 보존하되 복제되는 셀 껍질의 미지원 속성은 알 수 없는 ID/참조를 복제하지 않도록 거부한다. 보호·lock, 이름이 있는 셀, 비어 있지 않은 subList ID, 연결 목록·텍스트/번호 참조와 비영 textWidth/textHeight 캐시도 거부한다. 마지막 행이나 열의 삭제는 거부한다. UTF-8 XML만 편집한다.

기존 namespace-aware section tree, 숫자 속성 writer, source patch builder로 원문 범위만 조립한다. table 속성의 unknown 값·따옴표·이스케이프, 비대상 구역 XML은 바이트 단위로 유지한다. 행/셀 사이 원문 공백·주석은 보존하지만 새 셀의 삽입 위치와 관련한 주석 의미나 전체 XSD 적합성을 추론하지 않는다. 출력은 다시 구역 XML로 파싱하고 예상 새 격자와 기하를 검사한 뒤에만 반환한다. 임시 준비는 arena가 소유하고 최종 복사 성공 전에는 외부 상태를 바꾸지 않는다.

주요 거부 오류는 `InvalidSourceTableTarget`, `StaleSourceTableGrid`, `InvalidSourceTableCommand`, `LastSourceTableDimension`, `InvalidSourceTableGrid`, `MergedSourceTable`, `UnsupportedSourceTableStructure`, `UnsupportedSourceTableAttributes`, `UnsupportedSourceTableGeometry`, `ProtectedSourceTable`, `ProtectedFieldRange`, `InvalidTableParagraphIds`, `LimitExceeded`다. XML 문법·숫자 해석·할당 오류는 기존 API의 오류를 전파한다.

자료 범위는 프로젝트의 기존 table shape/geometry/deletion/XML patch API와 독립 합성 입력이다. 실제 Noori, 타 구현 소스·역공학 보고서·과거 포트 crypto/metrics/arrow는 사용하지 않았다. 새 컨텍스트만으로 엄격한 클린룸 인증을 주장하지 않는다.

집중 검증 명령:

```sh
mise exec -- zig test src/hx_source_table_grid_probe.zig -O ReleaseSafe -fllvm -j1 --test-filter 'source grid'
```

합성 검사는 네 명령, 앞/중간/끝 삽입·삭제, namespace URI 문자 참조와 원본 prefix, stale/invalid 대상, 마지막 차원 거부, 구역 ID 충돌, 비대상 앞뒤 바이트와 별도 표 보존, 생존 문단 원문, 위험 구조 거부, 비균등 열 폭과 직전 열 복제, 네 명령의 모든 backing 할당 실패를 검사한다. arena의 선택적 resize fallback이 주입 실패를 회복하지 않도록 OOM 검사 전용 backing allocator는 resize/remap을 비활성화한다. 정상 경로는 일반 allocator에서도 별도로 검사한다. 실제 문서·제품 세션·브라우저·저장 재열기 검증은 포함하지 않는다.

2026-11-10 이 명령은 작업 루트와 공유 후보 `zig-out/verification/document-transforms-connect-r1/source`에서 각각 **7/7 통과, skip 0**을 기록했다. 후보 반영 전 소유 파일의 존재/기준본은 `zig-out/verification/document-transforms-connect-r1/task-c-baselines/20261110T000817844059Z/manifest.json`에 보존했다. 반영 파일은 이 문서와 `src/hwpx/source_table_grid.zig`, `src/hx_source_table_grid_probe.zig` 세 개뿐이다. 커밋·푸시·배포는 수행하지 않았다.

후속 리뷰에서 원본 행마다 전체 출력 행을 다시 찾는 중첩 순회를 발견해 단조로운 목적지 커서로 교체했습니다. 출력 행을 한 번씩 소비하고, 이미 원문 순서인 셀/행 변경은 전체 정렬하지 않습니다. 두 속성 변경만 상수 크기로 정렬해 행 변경과 선형 병합합니다. 2048×1 표의 가운데 행 삽입 회귀를 포함한8개가 통과했습니다. 이 조립 단계의 개선을 기존 XML 파서·속성 writer를 포함한 전체 작업의 최악 복잡도 보장으로 확대하지 않습니다.

## 파일 단위 후보

`src/hwpx/source_table_grid_file.zig`는 패키지 보안 검사와 전체 XML 파트의 문단 ID 색인 뒤 대상 구역만 교체한 새 ZIP을 반환합니다. 서명·암호화 선언, 오래된 대상 크기, 합계 예산 초과는 거부합니다. 출력 패키지 자신의 section→manifest→entry 연결로 대상을 다시 해결하고 후보 XML과 비대상 payload·메타데이터를 확인합니다. ZIP의 물리 압축 배치 동일성을 주장하지 않습니다.

XML part 분류에서 entry마다 manifest를 다시 찾던 순회를 색인으로 교체했습니다. 새 분류 단계는 entries와 manifest를 각각 한 번 순회합니다. 전체 XML 파싱·압축의 최악 복잡도를 보장한다는 뜻은 아닙니다. ReleaseSafe 집중 검사 9개는 네 명령, 문서 전체 ID 충돌 방지, 비대상 ZIP 보존, 출력 성장·합계 예산, 서명 거부와 OOM, 명시된 생성 표 파일의 재열기를 포함합니다. 공개 SDK·CLI와 실제 브라우저 원본 표 편집은 아직 연결하지 않았습니다. 필수 환경변수와 실행은 [개발 명령](development-commands.md)의 파일 단위 표 격자 후보를 따릅니다.

2026-11-10 Task S 리뷰 재현: 수정 전 소문자 대조군과 기존 검사는 통과했지만 혼합 대소문자 MIME·매개변수의 ID/Signature 회귀6개와 구역 alias1개가 실패했다. `.bin`에 선언한 `Application/XML`·`APPLICATION/FOO+XML`이 전체 XML 색인/서명 검사에서 빠졌고, 서로 다른 manifest ID가 같은 entry를 참조하면 한 구역 편집이 다른 구역도 3행으로 바꿨다. [RFC 9110 §8.3.1](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.3.1)의 대소문자 비구분 type/subtype과 매개변수 분리에 맞춰 XML 분류를 고쳤다(전체 MIME 문법 검증기는 아니다). 입력·출력의 전체 XML inventory를 유지하고, 구역→entry의 단일 소유권은 bool 배열로 각각 O(entries+sections)에 검사해 준비 전에 `DuplicateSourceSectionEntry`로 거부한다. 비대상 구역 사이의 alias도 검사한다. 기존 패키지·보안 검사를 완화하지 않았다.

같은 후보의 root/control에서 승인된 `vanilla-hwpx.hwpx` 환경변수와 `zig test src/hx_source_table_grid_file_probe.zig -O ReleaseSafe -fllvm -j1 --test-filter 'HWPX source file grid'`로 각각 **21/21 통과, skip 0**(진입 harness1 포함)을 확인했다. 소문자/혼합 MIME의 독립 ID·Signature, 매개변수, 입력 문단/출력 XML 합계 한도, 양쪽 alias 대상·비대상 alias, 기존 네 명령·보안·OOM·ZIP 보존을 포함한다. 실제 fixture는 읽기 전에 승인된 root와 suffix의 정확한 절대경로만 순수 문자열로 허용하며, 보호 경로·`.`/`..`·중복 구분자 등의 거부는 파일 IO 없이 검사했다. 수정 전 기준본과 `before.log`, 최종 `final-root.log`·`final-control.log`는 `zig-out/verification/document-transforms-connect-r1/task-s-20261110T005658Z/`에 보존했다. 세 소유 파일만 동일 반영했으며 public ABI 검증으로 확대하지 않는다.

## Task AA: 직접 plain run/t 여러 개

위의 단일 run/t 제한을 확장했다. 셀의 단일 subList·단일 p는 유지하고, p의 직접 run은 하나 이상, 각 run의 직접 t는 0개 이상 허용한다. self-closing run/t와 명시적으로 닫는 빈 run/t도 다음 편집의 템플릿으로 수용한다. run 속성은 기존 charPrIDRef와 namespace 선언, t 속성은 namespace 선언만 허용한다. 필드·중첩·컨트롤·캐시·미지원 속성/자식 및 여러 subList/p의 거부는 유지한다. 공개 API·ABI와 native binding은 변경하지 않았다.

생존 셀은 주소 외의 모든 원문 run 순서·charPr 참조·prefix/namespace·텍스트를 유지한다. 삽입 셀은 템플릿의 서식 껍질을 복제하되 모든 t 내부를 비우고 새 문단 ID를 적용한다. 검사 시 직접 t 본문 범위를 셀별로 한 번 수집한다. 셀 조립은 최대 두 속성 변경만 정렬하고 이미 순서가 있는 본문 범위와 선형 병합한다. 셀마다 전체 트리를 재검색하거나 다중 t 변경 전체를 정렬하지 않는다. 노드·텍스트 바이트·출력 크기에 따른 이 조립 경계를 기존 파서 전체의 최악 복잡도 보장으로 확대하지 않는다.

집중 명령은 `mise exec -- zig test src/hx_source_table_grid_multirun_probe.zig -O ReleaseSafe -fllvm -j1 --test-filter 'source grid multirun'`과 기존 `hx_source_table_grid_probe.zig`의 `source grid` 필터다. 신규 검사는 독립 전체 XML 기대값으로 네 명령의 생존 원문/모든 t 비우기, 혼합 prefix·Unicode·문자 참조·빈 태그, 결과 재파싱 후 빈 셀 재복제, t가 없는 run만 가진 템플릿, 미지원 속성/구조 거부, 공유 allocation_failures helper로 네 명령의 전체 할당 실패, 2048행·셀당64 run/80 t 입력을 확인한다. 기존 8개 검사는 수정하지 않았다.

root/control의 수정 전 소유 파일은 `zig-out/verification/document-transforms-connect-r1/task-aa-20261110T014531Z/{root,control}/`에 별도 보존했다. 수정 전 control은 기존8개 통과·신규 의미 검사5개 실패(harness1 통과)를 기록했고, 최종 root/control은 각각 기존8개와 신규6개(harness1 포함) 통과·skip0을 기록했다. 로그·소유 델타·SHA 목록은 같은 증거 디렉터리에 둔다. 소스 XML/native 집중 시험이며 live 세션·SDK bridge·브라우저·전체 기능 완료의 증거가 아니다. 독립 합성 기대값과 기존 프로젝트 API를 사용했으며 엄격한 클린룸 인증을 주장하지 않는다.
