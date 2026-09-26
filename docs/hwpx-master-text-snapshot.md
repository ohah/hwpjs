# HWPX 마스터페이지 텍스트 소유 스냅샷

`Document.readMasterPageTextSnapshot(allocator, options)`는 [마스터페이지 텍스트 이벤트](hwpx-master-text.md)를 기존 [section 소유 스냅샷](hwpx-section-text-snapshot.md)의 `Builder`로 복사합니다. 파트 선택·직접 `hp:subList` 경계·XML 해독·조건부 분기·인라인 분류를 재구현하지 않습니다. 결과의 `snapshot.events`는 원문 태그와 정규화된 UTF-8 내용 조각을 소유하므로 원본 ZIP 버퍼와 `Document` 해제 뒤에도 유효합니다. `snapshot.report`는 기존 텍스트 보고서이며, 바깥 `parts`·`sub_lists`·`xml_bytes`는 마스터페이지 선택 보고서의 값을 보존합니다. 성공한 결과는 `deinit()`으로 해제합니다.

`options.scan`은 기존 마스터페이지 파트/XML/텍스트 한도와 `text.scan.branch_policy`를, `options.storage`는 공유 스냅샷의 이벤트 개수·복사 바이트 한도를 설정합니다. 두 저장 한도는 실제 할당 용량이나 프로세스 RSS의 상한이 아닙니다. 실패 시 부분 결과는 반환하지 않고 할당을 정리합니다. `Location.part_kind=.master_page`와 `part_ordinal`은 선택 파트의 순번이지 화면 페이지 순번이 아닙니다. 기본 분기 모드는 양쪽을 관측하며, `selected` 모드는 호출자가 지정한 capability만 적용합니다.

이 API는 문단·run·`hp:t`·인라인 경계의 소유 복사본이지 표시 문자열, 페이지 적용, 편집 모델 또는 무손실 재저장이 아닙니다. 마스터페이지 밖 문단, 외국 namespace의 동명 `subList`, 전체 XML 트리, BinData와 서식 의미는 결과에 포함되지 않습니다. 이벤트의 원문 태그만으로 namespace 맥락을 완전히 재구성할 수도 없습니다.

## 검증과 남은 근거

합성 ZIP은 직접 `subList` 범위와 중첩 문단, 범위 밖 문단·외국 namespace 배제, 문자 참조·빈 `t`·tab 순서, 정확한 이벤트/복사 바이트 경계, 스캐너 한도, 양쪽 선택 분기, 전 할당 실패 지점을 검사합니다. 한 실제 파일 `reference/rhwp/samples/hwpx/exam-kor-1p.hwpx`에서는 선택 마스터페이지 3개·직접 `subList` 3개·문단 21개·run 29개·`hp:t` 24개·내용 268바이트를 확인했습니다. 이 수치는 독립 Python `zipfile`/`ElementTree` 집계와 일치했고, 스냅샷의 내용 바이트와 `hp:t` 시작/끝 개수도 자체 보고서와 일치했습니다. 다만 같은 Zig 스캐너의 스트리밍 보고서와 스냅샷 비교는 독립 파서 검증이 아닙니다.

기존 [마스터페이지 텍스트](hwpx-master-text.md)의 476개 문서 조사는 스트리밍 이벤트의 집계·순서 지문을 대조합니다. 이번 소유 스냅샷 자체는 그 전체 corpus에서 파일별 내용·이벤트 순서를 독립 대조하지 않았습니다. 한 실제 파일과 합성 반례를 전체 HWPX·버전별 포맷 또는 화면 동치의 근거로 확대하지 않습니다. 재현 명령은 [개발·검증 명령](development-commands.md)에 둡니다.

최종 소스에서 전용 Debug·ReleaseSafe·ReleaseFast 테스트는 각각 5/5, 실제 한 파일 ReleaseFast 검사는 1/1, 전체 Debug `zig build test --summary all`은 2,553/2,553, ReleaseSafe 제품 빌드는 5/5 단계를 통과했습니다. `zig fmt --check build.zig src`와 `git diff --check`도 통과했습니다. 전체 테스트는 로컬 corpus가 있는 환경에서 수행한 결과이며, 기본 테스트의 통과를 독립 파일별 스냅샷 내용 대조로 계산하지 않습니다.
