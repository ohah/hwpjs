# HWPX 삽입 저장의 독립 검사

`tools/hwpx-insertion-oracle.mjs`는 공개 typed 삽입의 저장 전후 ZIP/XML을 검사합니다. 검사 대상은 전체 ZIP 인벤토리·CRC·다른 항목의 원문·메타데이터와 대상 section의 전체 XML입니다. 텍스트만 같다는 이유로 다른 run 서식·제어·자원 변경을 허용하지 않습니다. Python 일반/최적화 모드가 모두 통과하고 잘못된 기대 문자열도 거부해야 성공입니다.

## 소유권과 경로 선택

좌표의 `sectionIndex`는 해당 section의 selected-default 문단 순서에서0기반 인덱스입니다. 문서 전역 paragraph ID가 아닙니다. source 좌표 분류는 저장 후 출력이 아니라 원본만 읽습니다.

- 일반 텍스트 leaf는 기존 `hwpx-plain-splice-oracle.py`를 사용합니다.
- offset0에서 첫 삽입 소유자가 자식 없는 run이면 그 run에 `hp:t`를 만드는 별도 경로를 사용합니다. 뒤의 비어 있지 않은 run으로 서식 소유권을 옮기지 않습니다.
- 첫 텍스트에 tab 같은 인라인 자식이 있어 일반 검사기가 명시적으로 미지원이라고 판정하면 offset0 prefix 검사로 전체 하위 트리를 보존 대조합니다. 원본이 해당 prefix 위치임을 확인한 경우에만 사용합니다.
- 일반 검사의 불일치는 다른 경로를 시도해 성공으로 바꾸지 않습니다. 알려지지 않은 선행 제어를 폭0이라고 가정하지 않으며 offset0 외의 미모델링 삽입은 미지원으로 남깁니다.

선행 구역·단 설정, 비텍스트 쪽 번호 설정, 관측 HYPERLINK parameter 문법만 source 분류의 폭0 제어로 확인합니다. HYPERLINK는 label과 field marker를 구분하며 marker·parameter 전체는 변경 없이 검사합니다. 알 수 없는 제어·형식은 이 목록에 임의로 추가하지 않습니다.

## 실제 오판 재현과 수정

`example.hwpx`의 첫 문단에는 메타데이터 run 다음에 빈 charPrIDRef4 run, 그 뒤 charPrIDRef1의 “삼강오륜” run이 있습니다. 제품은 빈 run에 입력했지만 기존 일반 검사기는 hp:t만 수집해 다음 run에 삽입될 것으로 잘못 예상했습니다. 실제 저장 section은 빈 run만 확장한 독립 기대값과 바이트 단위로 일치했습니다. 원본·baseline SHA256은 `4bc0e084ef9c4701103ef17dd0621fd9897924e357d3cb21a5fa2b62ef03318d`, 저장 SHA256은 `8f453d213e78163abd05e93d5bc74202cc7c0a06e49122bd64dba6c268327168`입니다. 제품 코드는 이 오판 때문에 수정하지 않았습니다.

관측 근거는 `zig-out/verification/hwpx-example-oracle-review`입니다. 공개 API 편집·저장·undo/redo·재열기·재저장, 정확한 XML 기대값 및8종 변조 거부를 확인했습니다. 최초 감사의 failure 행은 고쳐 쓰지 않았습니다.

새 검사를 `example`, `footnote-endnote`, `hyperlink`, `page`, `table-position`의 실제 저장본에 적용해5개 모두 통과했습니다. 마지막 source guard 버전은 `zig-out/verification/hwpx-expanded-oracle-cases/source-guard-revalidation.json`에 코드 해시와 함께 기록했습니다. 이 결과는 별도 집중 검증이며 원래 전수 감사의 실행 기록을 소급 대체하지 않습니다.

## 선행 객체 슬롯

직접 tbl/line/rect/pic 뒤의 유일한 빈 텍스트와 selected-default/direct 좌표 대응은 [선행 객체 독립 검사](hwpx-leading-object-insertion-oracle.md)가 별도 계약과 검증 근거를 소유합니다.

## 적대적 검증

`tests/hwpx/anchor-prefix-oracle-metadata.test.mjs`와 `tests/hwpx/insertion-oracle.test.mjs`의6개 테스트가 통과했습니다. ZIP 중복·압축 방식·시각·extra/comment·속성 변조, 다른 payload·제어 트리·텍스트·서식 변경, 다른 run에 삽입한 결과, 잘못된 기대 문자열, 미지 제어의 폭 추정을 거부합니다. Node의 대용량 Python 입력은 공통 `oracle-process.mjs`의 파일 stdin을 사용합니다.

이 검사는 한 문단의 삽입 원문 보존 증거입니다. 모든 편집 위치·명령·조판·브라우저 입력과 전체 포맷 지원을 증명하지 않습니다.

## 형광펜·책갈피 라벨의 실제 텍스트 소유자

2026-10-25에 전수 감사의 complete XML mismatch2건을 재현했습니다. 중간진도보고서는 `hp:t`의 첫 content가 `markpenBegin.tail`인데 검사가 표식 앞의 `t.text`에 삽입하도록 예상했습니다. 추진일정은 `ignore=1` 제목 표식만 있는 첫 `t` 다음 BOOKMARK 라벨이 선택 대상인데 검사가 첫 `t`를 대상으로 삼았습니다. 원래 저장은 각 문서의 section0.xml에 요청한 UTF8 문자열10바이트만 삽입한 결과이며, 다른 payload는 그대로였습니다. 기존 검사기는 잘못된 위치 삽입을 통과시키기도 했으므로 제품 writer 대신 검증기의 소유자 선택을 수정했습니다.

`hwpx-insertion-source.py`는 원본만 읽어 관측된 형광펜 begin/end 사이 첫 tail, 또는 제목 표식 다음 로컬 BOOKMARK begin/end로 둘러싸인 라벨 text를 선택합니다. 색·marker 종류·로컬 ID 연결·순서를 검증하며, 모르는 앞선 제어나 불완전한 패턴을 폭0으로 추정하지 않습니다. router와 전체 XML 검사기가 같은 독립 source helper를 사용합니다. 일반 prefix와 이 두 mode는 구분하며 검증 불일치를 다른 mode로 재시도하지 않습니다. 형광펜 밖·책갈피 밖 삽입과 다른 metadata/payload 변경은 전체 signature 비교에서 거부합니다. 이는 필드 편집 권한을 추가하는 제품 API가 아닙니다.

`tests/hwpx/insertion-owned-prefix-oracle.test.mjs`를 포함한 oracle8개와 증거 재사용3개가 통과했습니다. 새 source helper 해시도 감사 provenance와 증거 재사용 조건에 포함했습니다. `zig-out/verification/hwpx-owned-prefix-corrections`는 새 명시 WASM `8c3143aa4c7e123d466536a32d2dcc75c595595600e27c4ca10a40d5f1fe5cf3`에서 실제 두 문서의 typed 삽입·저장·undo/redo·재열기·동일 재저장을 완료하고 일반/최적화 Python 및 잘못된 기대값 거부까지 각각 확인했습니다. source/implementation/WASM 불변도 확인했습니다. 이전484경로 감사의 실패 행은 그대로 남기며 이2건 집중 재검증으로 구분합니다. 별도의 무관한 필드 표시 변화3건은 이 수정으로 해결됐다고 집계하지 않습니다.
