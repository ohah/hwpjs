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

## 적대적 검증

`tests/hwpx/anchor-prefix-oracle-metadata.test.mjs`와 `tests/hwpx/insertion-oracle.test.mjs`의6개 테스트가 통과했습니다. ZIP 중복·압축 방식·시각·extra/comment·속성 변조, 다른 payload·제어 트리·텍스트·서식 변경, 다른 run에 삽입한 결과, 잘못된 기대 문자열, 미지 제어의 폭 추정을 거부합니다. Node의 대용량 Python 입력은 공통 `oracle-process.mjs`의 파일 stdin을 사용합니다.

이 검사는 한 문단의 삽입 원문 보존 증거입니다. 모든 편집 위치·명령·조판·브라우저 입력과 전체 포맷 지원을 증명하지 않습니다.
