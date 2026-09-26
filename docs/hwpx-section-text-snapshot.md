# HWPX section 텍스트 소유 스냅샷

`Document.readSectionTextSnapshot(allocator, options)`는 기존 [section 텍스트 이벤트](hwpx-section-text.md)를 그대로 소비합니다. ZIP·XML 선택과 문자 참조 해독·조건부 분기 정책을 새로 구현하지 않습니다. 결과는 spine 순서의 문단·run·`hp:t` 시작/끝, 정규화된 UTF-8 내용 조각, 인라인 시작/끝/빈 요소의 순서와 위치를 소유합니다. 이벤트의 `raw_tag`는 호출 중 빌린 원문 태그를 복사하므로 원본 `Document`와 ZIP 버퍼 해제 뒤에도 살아 있습니다. `text_end`에는 원문 닫는 태그가 없으며 시작 태그의 namespace 선언 맥락도 따로 조립하지 않습니다.

스냅샷은 `section_text.Report`를 함께 반환하지만 전체 XML 트리·표·도형·header·마스터페이지·BinData를 소유하지 않습니다. 기본 분기 정책은 두 switch 분기를 모두 관측하며, 명시적 `options.scan.text.branch_policy`로 선택 분기를 요청할 수 있습니다. `raw_tag`를 해석해 편집 모델이나 무손실 재저장으로 승격하지 않습니다. 표시용 공백/줄바꿈 합성, 필드 의미, 텍스트 외부 콘텐츠와 layout 적용도 하지 않습니다.

`options.storage.max_events` 기본 4,000,000은 이벤트 개수를, `max_owned_bytes` 기본 128 MiB는 복사한 태그와 UTF-8 내용의 길이 합계를 제한합니다. 두 한도는 배열의 실제 할당 용량까지 포함한 RSS 상한이 아닙니다. 원본 section XML·정규화 내용 한도는 기존 `options.scan`이 별도로 소유합니다. 실패 시 부분 스냅샷은 반환하지 않고 이미 복사한 버퍼를 모두 해제합니다. 성공 시 `Snapshot.deinit()`으로 스냅샷을 해제합니다.

합성 검사는 문자 참조와 빈 `hp:t`, 문단/run 경계, tab, 미지원 중첩 인라인 태그, 정확한 이벤트/복사 바이트 한도, 스캐너 한도와 전 할당 실패 경로를 검사합니다. 실제 `issue2527_empty_linesegs.hwpx`에서는 `hp:t` 5개·정규화 UTF-8 607바이트를 소유하고, 독립 Python `zipfile` + `ElementTree`의 `hp:t` 텍스트 연결 바이트와 SHA-256 `1d34e0d7c3ea9f23648e04763504fbe36da71eeeb6cbb774d5c0ea5d131ab530`까지 일치했습니다. 이는 그 한 파일의 텍스트 내용 대조이지 모든 HWPX 문서의 표시 순서나 편집 가능성을 증명하지 않습니다.

재현 명령은 [개발·검증 명령](development-commands.md)에 둡니다.

이번 연결의 최종 검증은 전용 Debug·ReleaseSafe·ReleaseFast 각 5/5, 기존 section 텍스트 포함 Debug 15/15, 실제 파일 ReleaseFast 1/1 및 Python 바이트 대조, 전체 Debug `zig build test --summary all` 5/5 단계·2,549/2,549 테스트, ReleaseSafe 제품 빌드 5/5 단계, 기존 CFB 비교 47/47입니다. CFB 비교는 이 스냅샷의 독립 의미 검증으로 계산하지 않습니다.

## corpus 파일별 독립 대조

`src/hwpx_text_snapshot_corpus.zig`는 로컬 두 corpus의 `.hwpx` 후보마다 스냅샷을 새로 만들고 내용 이벤트를 spine 순서로 SHA-256에 넣습니다. 보고서의 문단/run/text 수는 복사된 시작·끝 이벤트 개수와 대조하고, UTF-8 바이트 수는 복사한 내용 합계와 대조합니다. `tools/hwpx-text-snapshot-corpus-diff.py`는 별도로 Python `zipfile`·`ElementTree`로 OPF spine을 따라 section의 `hp:t` 내용을 순서대로 연결해 같은 파일별 SHA-256과 여섯 개 수치를 비교합니다. 별도 순서 해시는 문단/run/text 시작·끝, 8종 인라인 종류와 미지원 종류의 시작·끝, 각 UTF-8 바이트를 순서대로 넣습니다. 빈 인라인과 명시적 시작·끝은 같은 의미 경계로 정규화해 XML 표기 차이와 이벤트 조각 분할에 의존하지 않습니다. 경로 해시로 정상·ZIP 거부·암호화 **세 파일 집합**을 일대일 대응시켜 특정 파일의 차이가 합계에서 상쇄되지 않게 합니다. 검증기 자체는 누락 파일·내용/순서 해시·수치·분류 교환·합계 변조를 실패로 잡는 반례를 일반 Python과 `python -O` 양쪽에서 실행합니다. `A<tab/>B`와 `AB<tab/>`처럼 연결 텍스트가 같고 위치만 다른 반례도 순서 해시가 구별합니다.

2026-09-26 로컬 표본 484개 중 ZIP 거부 6개, 암호화 2개를 별도 분류한 정상 476개 모두에서 파일별 내용·순서 해시와 section·문단·run·`hp:t`·빈 `hp:t`·본문 UTF-8 길이가 일치했습니다. 정상 합계는 section 544, 문단 215,146, run 267,347, `hp:t` 230,677, 빈 `hp:t` 14,607, 본문 7,975,957바이트입니다. 로컬 `reference/rhwp`는 Git에 포함되지 않으므로 깨끗한 체크아웃의 기본 audit로 재현되지 않습니다. 이 대조는 선택된 section의 원문 텍스트 이벤트에 한정되며 글꼴·조건부 활성 선택·실제 화면 배치·비선택 XML·편집/저장·모든 HWPX 버전 적합성을 보증하지 않습니다.

이 corpus 조사기 추가 뒤 기본 Debug `zig build test --summary all`을 다시 실행해 5/5 단계·2,549/2,549 테스트, ReleaseSafe 제품 빌드 5/5 단계를 확인했습니다. 기본 suite는 corpus 파일별 순서 해시를 실행하지 않으므로 위 Python 대조가 별도의 필수 근거입니다.

## 조건부 선택 분기 corpus 대조

같은 Zig 조사기와 Python ZIP/XML 조사기를 `raw`, 지원 namespace가 없는 `selected_default`, 차트 namespace `http://www.hancom.co.kr/hwpml/2016/ooxmlchart`를 명시한 `selected_chart` 세 모드로 실행합니다. 선택 모드는 기존 section 텍스트 스캐너에 `branch_policy`만 전달하고, Python 조사기는 관측된 직접 run 자식 `switch`의 정확한 `case/default` 순서와 요구 namespace를 별도로 확인합니다. 다른 분기 모양을 추정해 통과시키지 않습니다. 원문 모드는 순회식 결과 외에 `ElementTree.itertext()`의 직접 본문·문단/run/text 개수도 한 번 더 대조합니다.

2026-09-26 로컬 정상 476개 모두에서 두 선택 모드의 파일별 내용·이벤트 순서 해시, section·문단·run·`hp:t`·빈 `hp:t`·본문 바이트 수가 각각 독립 조사와 일치했습니다. 두 선택 모드는 각각 section 544, 문단 215,144, run 267,345, `hp:t` 230,675, 빈 `hp:t` 14,607, 본문 7,975,784바이트입니다. 원문 양쪽 분기보다 문단/run/text가 각 2개, 본문이 173바이트 적으며 이 차이는 [기존 선택 텍스트 조사](hwpx-selected-section-text.md)의 차트/OLE 캡션 분기 파일에서 발생합니다. 두 선택 모드의 총계가 같아도 실제 차트·OLE 표현이나 화면 결과의 동치를 뜻하지 않습니다. 차트 namespace 선언은 호출자 capability를 시험한 것이지 차트 렌더링 구현 완료 선언이 아닙니다. 나머지 ZIP 거부 6개·암호화 2개도 모드별 파일 집합을 대조했으며, 이 결과는 해당 corpus와 명시한 capability 두 경우에 한정됩니다.

선택 corpus 조사기 추가 뒤 `zig fmt --check build.zig src`, 세 모드의 ReleaseFast Zig/Python 파일별 대조, `python3`·`python3 -O` 검증기 반례, ReleaseSafe 제품 빌드 5/5 단계, 전체 Debug `zig build test --summary all` 5/5 단계·2,549/2,549 테스트가 통과했습니다. 선택 corpus 대조는 기본 suite에 포함되지 않으므로 세 모드의 별도 실행 결과가 필요합니다.
