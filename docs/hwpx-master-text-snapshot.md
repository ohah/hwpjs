# HWPX 마스터페이지 텍스트 소유 스냅샷

`Document.readMasterPageTextSnapshot(allocator, options)`는 [마스터페이지 텍스트 이벤트](hwpx-master-text.md)를 기존 [section 소유 스냅샷](hwpx-section-text-snapshot.md)의 `Builder`로 복사합니다. 파트 선택·직접 `hp:subList` 경계·XML 해독·조건부 분기·인라인 분류를 재구현하지 않습니다. 결과의 `snapshot.events`는 원문 태그와 정규화된 UTF-8 내용 조각을 소유하므로 원본 ZIP 버퍼와 `Document` 해제 뒤에도 유효합니다. `snapshot.report`는 기존 텍스트 보고서이며, 바깥 `parts`·`sub_lists`·`xml_bytes`는 마스터페이지 선택 보고서의 값을 보존합니다. 성공한 결과는 `deinit()`으로 해제합니다.

`options.scan`은 기존 마스터페이지 파트/XML/텍스트 한도와 `text.scan.branch_policy`를, `options.storage`는 공유 스냅샷의 이벤트 개수·복사 바이트 한도를 설정합니다. 두 저장 한도는 실제 할당 용량이나 프로세스 RSS의 상한이 아닙니다. 실패 시 부분 결과는 반환하지 않고 할당을 정리합니다. `Location.part_kind=.master_page`와 `part_ordinal`은 선택 파트의 순번이지 화면 페이지 순번이 아닙니다. 기본 분기 모드는 양쪽을 관측하며, `selected` 모드는 호출자가 지정한 capability만 적용합니다.

이 API는 문단·run·`hp:t`·인라인 경계의 소유 복사본이지 표시 문자열, 페이지 적용, 편집 모델 또는 무손실 재저장이 아닙니다. 마스터페이지 밖 문단, 외국 namespace의 동명 `subList`, 전체 XML 트리, BinData와 서식 의미는 결과에 포함되지 않습니다. 이벤트의 원문 태그만으로 namespace 맥락을 완전히 재구성할 수도 없습니다.

## 검증과 남은 근거

합성 ZIP은 직접 `subList` 범위와 중첩 문단, 범위 밖 문단·외국 namespace 배제, 문자 참조·빈 `t`·tab 순서, 정확한 이벤트/복사 바이트 경계, 스캐너 한도, 양쪽 선택 분기, 전 할당 실패 지점을 검사합니다. 한 실제 파일 `reference/rhwp/samples/hwpx/exam-kor-1p.hwpx`에서는 선택 마스터페이지 3개·직접 `subList` 3개·문단 21개·run 29개·`hp:t` 24개·내용 268바이트를 확인했습니다. 이 수치는 독립 Python `zipfile`/`ElementTree` 집계와 일치했고, 스냅샷의 내용 바이트와 `hp:t` 시작/끝 개수도 자체 보고서와 일치했습니다. 다만 같은 Zig 스캐너의 스트리밍 보고서와 스냅샷 비교는 독립 파서 검증이 아닙니다.

기존 [마스터페이지 텍스트](hwpx-master-text.md)의 476개 문서 조사는 스트리밍 이벤트의 집계·순서 지문을 대조합니다. 소유 스냅샷은 아래 파일별 독립 대조로 별도 검증합니다. 한 실제 파일과 합성 반례를 전체 HWPX·버전별 포맷 또는 화면 동치의 근거로 확대하지 않습니다. 재현 명령은 [개발·검증 명령](development-commands.md)에 둡니다.

스냅샷 연결 단계(커밋 `49419ebe`)에서 전용 Debug·ReleaseSafe·ReleaseFast 테스트는 각각 5/5, 실제 한 파일 ReleaseFast 검사는 1/1, 전체 Debug `zig build test --summary all`은 2,553/2,553, ReleaseSafe 제품 빌드는 5/5 단계를 통과했습니다. `zig fmt --check build.zig src`와 `git diff --check`도 통과했습니다. 이때의 기본 테스트 통과를 이후 추가된 독립 파일별 스냅샷 내용 대조로 계산하지 않습니다.

## corpus 파일별 독립 대조

`src/hwpx_master_text_snapshot_corpus.zig`는 두 로컬 corpus의 각 `.hwpx`를 새 문서로 열어 마스터페이지 스냅샷을 만듭니다. section 조사기와 `src/hwpx_text_snapshot_corpus_common.zig`의 내용 SHA-256·이벤트 순서 SHA-256 및 이벤트/보고서 계수 검사를 공유하고, 마스터페이지 파트·`subList`·XML 길이·위치 필드는 별도로 검사합니다. `tools/hwpx-master-text-snapshot-corpus-diff.py`는 Python `zipfile`/`ElementTree`로 OPF manifest의 정규 `Contents/masterpageN.xml` 항목을 선택하고, 루트의 직접 `hp:subList` 안에서만 텍스트·문단·run·`hp:t`를 독립 순회합니다. section Python 조사기도 `tools/hwpx_text_snapshot_order.py`의 이벤트 순서 규칙을 공유합니다. 이 공통 규칙이 두 제품 경로를 대조하는 oracle 자체의 독립성을 뜻하지는 않으므로, 원문 모드에는 `ElementTree.itertext()`와 별도 count 순회를 추가해 순회 결과를 교차 검사합니다.

정상·ZIP 거부·암호화 파일 집합을 경로 SHA-256으로 각각 일대일 대조하고, 정상 파일마다 내용·순서 SHA-256 및 파트·`subList`·문단·run·`hp:t`·빈 `hp:t`·UTF-8 내용·선택 XML 길이를 모두 비교합니다. 마스터페이지 순서 해시에는 빈 파트까지 파트 경계 표식을 넣어, 연결 텍스트와 파트 수가 같아도 이벤트의 파트 소속이 바뀌는 경우를 구분합니다. 검증기의 누락 파일, 내용/순서 해시 변경, 길이 변경, 거부/암호화 분류 교환, 합계 변조는 자체 음성 대조로 실패하며 `python3 -O`에서도 같습니다. `A<tab/>B`와 `AB<tab/>`처럼 합쳐진 본문은 같아도 위치가 다른 반례도 순서 해시로 구분하고, 외국 namespace의 `subList` 및 범위 밖 문단은 집계하지 않습니다.

2026-09-26 로컬 `.hwpx` 484개 후보 중 ZIP 거부 6개·암호화 2개를 분리한 정상 **476개 모두**에서 원문·기본 선택·차트 capability 선택 세 모드의 파일별 결과가 일치했습니다. 각 모드의 합계는 선택 마스터페이지 61개, 직접 `subList` 61개, 문단 394개, run 521개, `hp:t` 371개, 빈 `hp:t` 165개, 내용 3,280바이트, 마스터페이지 XML 578,075바이트입니다. 세 모드가 같다는 결과는 이 표본에서 마스터페이지 분기 차이가 관측되지 않았다는 뜻이지 선택 분기 구현의 실파일 양성 근거가 아닙니다. 선택 분기는 합성 ZIP에서 별도 검증합니다. 기본 audit에는 로컬 `reference/rhwp`가 필요한 전체 corpus 대조가 포함되지 않으며, 텍스트 이외의 문서 의미·레이아웃·편집/저장 및 모든 버전의 동치는 여전히 미검증입니다.

파트 경계 이동 반례를 추가한 최종 소스에서 마스터페이지 세 모드와 기존 section 세 모드의 파일별 독립 대조가 다시 통과했습니다. Python 검증기의 일반·`-O` 음성 대조, 파트 해시 단위 테스트의 Debug·ReleaseSafe·ReleaseFast 각 2/2, 전체 Debug `zig build test --summary all` 2,554/2,554, ReleaseSafe 제품 빌드 5/5 단계, Zig 포맷·Git diff 검사가 통과했습니다. 기본 suite는 선택 실파일 corpus 대조를 실행하지 않으므로 이 결과는 별도 실행 근거입니다.
