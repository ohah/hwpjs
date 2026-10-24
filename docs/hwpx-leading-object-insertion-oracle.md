# 선행 객체 뒤 빈 텍스트의 독립 삽입 검사

`tools/hwpx_leading_object_slots.py`는 직접 tbl/line/rect/pic1~1,024개 뒤의 유일한 빈 `hp:t`를 원본만으로 선택합니다. 원본 해시·파일명 allowlist로 통과시키지 않습니다. 허용하는 문단은 선택적인 관측 metadata run 다음 객체 run 하나와 선택적인 linesegarray뿐이며, metadata/namespace/속성 이름·자식 순서를 검사합니다. 시작 좌표는 직접 객체 개수와 같아야 합니다. nested 객체 안의 글자를 앞선 객체 수로 더하지 않고 객체 payload는 불투명 원문 보존 대상으로 둡니다. switch와 새 control 종류를 폭0으로 가정하지 않습니다.

기본 모델의 문단 번호는 직접 section child 기준입니다. `hwpx-leading-object-oracle.py`는 공개 검사의 selected-default0기반 문단을 원본 ET node identity로 direct index에 대응시킵니다. nested 문단을 direct 문단 번호로 바꾸어 쓰지 않습니다. 중첩 문단이 interleave된 사례의 selectedIndex2→directIndex1을 별도로 검사했습니다. source에서 슬롯을 선택한 뒤에만 after를 열어 비교합니다.

검사는 전체 XML DOM의 namespace/prefix·속성·자식 순서·문서 수준 comment/PI·공백·캐시와 ZIP inventory/순서·다른 part·entry metadata를 대조합니다. 바뀐 part의 압축 바이트/CRC/길이가 같다는 주장이 아닙니다. ZIP/XML 크기·expanded size·entry 수·depth/node 수를 제한하고 DTD/entity와 암호화 member·중복 inventory·경로 혼동을 거부합니다. 검증은 Python assert에 의존하지 않습니다.

CLI의 supported/unsupported/verified는 exit0, mismatch는 exit1, 잘못된 입력은 exit2입니다. JS는 이 JSON state를 일반/`-O` 양쪽에서 검사하고, 실제 기대값이 통과한 경우에도 잘못된 기대 문자열을 반드시 mismatch로 거부해야 성공입니다. source가 지원되는 다른 슬롯의 합법적인 좌표를 지정했다고 해서 trailing slot으로 바꾸어 검사하지 않습니다. 기존 일반 검사로 미지원이거나 불일치로 남습니다. 출력 불일치를 다른 경로로 재시도하지 않습니다. 모델·wrapper의 해시도 전수 감사와 증거 재사용 지문에 포함합니다.

## 실측·반례

원래 WASM `fbaff9b7d1e6683061157504a2c4be1030c8ba123120484947824c1bdf91d750`의 raw Native 관측에서 실제6개(borderfill, shapeline, matrix, table-caption, table, table2)와 새 동형4개의 source/저장본이 독립 모델과 일치했습니다. metadata가 없는 line 하나, rect2개, table 순서 교환, tbl/line/rect 혼합도 source grammar로 검사했습니다. 이는 객체 한 개의 표시 자리표시자가 UTF16 한 단위라는 한정 관측이며 모든 object/text 좌표 규칙이나 payload 의미 완료 증거가 아닙니다. `zig-out/verification/hwpx-leading-object-slot-model`에 캡처를 보존했습니다.

모델9개와 wrapper10개 unittest가 각각 일반/`-O`에서 통과했습니다. 전체 JS oracle/증거 재사용13개도 통과했으며 잘못된 위치·문자열·좌표·run·객체 payload·metadata·cache·다른 ZIP part 변경을 거부합니다. 초기 JS 테스트의 `<switch/>`는 유효한 선택 문법조차 없는 입력이어서 mismatch였고, 알려진 case/default 문법을 가진 switch가 미지원으로 남는 반례로 구분했습니다. 검증기를 완화해 잘못된 입력을 통과시키지 않았습니다.

새 명시 WASM `8c3143aa4c7e123d466536a32d2dcc75c595595600e27c4ca10a40d5f1fe5cf3`의 `zig-out/verification/leading-object-edit-corrections`는 위 실제6개에 앱 로더와 typed 삽입·저장·undo/redo·재열기·동일 재저장 및 독립 일반/최적화 XML 검사를 실행해6개 모두 통과했습니다. 원본·WASM·실행 구현 불변도 확인했습니다. 이전484경로 감사의139미지원 결과를 고쳐 쓰지 않으며 이6건 후속 검증으로 구분합니다. 차트 switch의 독립 선택 분기, 다른 객체 종류·문자 혼합·빈 t 부재·모든 위치/명령·브라우저 조판은 미완료입니다.


## ZIP/XML 무결성 보강

`tools/hwpx_zip_integrity.py`가 ZIP 물리 검증을 소유합니다. source/after 및 비대상 멤버까지 central/local 이름·flags·codec·크기·CRC·descriptor와 경계를 대조하고, STORED 실제 바이트 또는 bounded raw DEFLATE를 직접 검사합니다. `ZipFile.read/testzip`이 선언 길이 뒤 데이터를 숨길 수 있으므로 그것만으로 무결성을 판정하지 않습니다. 원시 이름의 NUL, 실제 해제 크기 초과/부족, CRC 불일치, DEFLATE EOF 부재/잔여 stream은 거부합니다. 실제 해제량에도 총량 예산을 적용합니다. 현재 codec은 STORED/DEFLATED만 지원하며 다른 codec과 ZIP64 local-size marker는 명시 거부합니다.

XML은 Expat streaming preflight로 depth128/node1,000,000 예산과 DTD/entity를 DOM 생성 전에 검사합니다. depth1500 거부에서 DOM cleanup recursion이 발생하지 않고, 알 수 없는 encoding은 InvalidXML JSON/exit2가 됩니다. ZIP 오류도 InvalidZIP JSON/exit2이며 select와 verify의 before/after에서 동일합니다. 원래 source-only 슬롯 선택과 전체 XML 비교 정책은 유지합니다.

회귀는 기존 wrapper10개, 저장 Native 관측을 읽기만 하는 모델9개, 독립 적대19개 및 ZIP 전용10개가 일반/최적화에서 통과했습니다. 원래 독립 리뷰의 expected failure5개는 기존 요청 JSON 그대로 expected-failure flag 없이 재생해17/17 정상 통과했습니다. 기존 실패 산출물은 보존하며 수정 증거는 `zig-out/verification/hwpx-leading-object-integrity-fix`에 분리했습니다. 이번 실행은 Python 검사와 저장 관측 재생으로, 새 Native/WASM/browser 검증이 아닙니다. main 소유 감사/재사용 JS의 provenance 목록에는 새 ZIP 모듈도 필요하며 별도 `main-provenance-dependency.patch`로 전달합니다.

통합 후 최신 후보 WASM `e7741dfb0baadb55f12984c8314404e855d86eed667ec99a7210539f658bf169`로 실제6개 파일을 새로 열고 typed 편집·저장·이력·재열기와 독립 XML 검증을 실행했습니다. `zig-out/verification/leading-object-integrity-positive`는6실행/6verified이며 이전 결과 재사용0, 원본/구현/WASM 변경0입니다. 새 ZIP 모듈의 감사·재사용 지문도 연결했고 관련 JS5/5 및 main 직접 적대 검사19/19(일반/-O)를 확인했습니다. 특정 위치의 삽입 검증이며 모든 객체 편집이나 조판 완료를 뜻하지 않습니다.


## 공개 Python 검사와 선택 자료 경계

독립 Python 검사는 표준 라이브러리만 사용합니다. 기본 실행에서 WASM을 찾거나 실행하거나 관측 파일을 생성하지 않습니다. 자료가 없는 clean checkout에서도 synthetic 적대19개와 ZIP10개, wrapper의 synthetic7개가 실행됩니다.

- `tests/hwpx/leading_object_adversarial_tests.py`:19개 모두 synthetic입니다. metadata도 검사 안에서 작은 XML을 생성하며 reference/저장 관측 파일에 의존하지 않습니다.
- `tests/hwpx/zip_integrity_tests.py`:10개 모두 synthetic입니다.
- `tests/hwpx/leading_object_oracle_wrapper_tests.py`:10개 중 synthetic7개는 항상 실행합니다. 저장 관측2개와 실제 reference chart1개는 해당 선택 자료가 없으면 각각 이유를 표시하여 skip합니다. 자료 부재로 synthetic 검사를 통째로 skip하지 않습니다.
- `tests/hwpx/leading_object_slot_model_tests.py`:9개는 저장 관측을 읽기만 하는 선택 재생입니다. 기본 `zig-out/verification/hwpx-leading-object-slot-model` 경로가 없으면 각 검사를 skip하며, 과거 로컬 WASM artifact를 필수 요구하지 않습니다. 자료가 있어도 Native/WASM을 실행하지 않습니다. 그 안의 실제 chart 검사는 reference 부재 시 별도로 skip합니다.
- `tests/hwpx/leading_object_saved_observations.py`:선택 관측의 재생 로더입니다.10개 이름/중복/count/sourceSHA 및 before/after 파일을 확인합니다. `HWPJS_LEADING_OBJECT_SAVED_EVIDENCE`로 경로를 명시했는데 경로가 없거나 자료가 불완전/손상됐다면 실패합니다. 이를 optional skip으로 숨기지 않습니다. 이 sourceSHA는 테스트 재생 자료의 바인딩이며 모델의 슬롯 지원 허용 기준이 아닙니다.

각 Python 파일을 `python3 -B <파일>` 및 `python3 -B -O <파일>`로 실행합니다. 관측 없는 공개본의 기대값은 적대19통과, ZIP10통과, wrapper7통과+3skip, 모델0통과+9skip입니다. Skip은 관측을 검증했다는 뜻이 아닙니다. 저장 관측이 필요하면 환경변수로 별도 캡처 경로를 주며, 캡처/원본/WASM은 공개 파일 closure에 포함하지 않습니다.

공유 selected-default 순서 의존성은 기존 `tools/hwpx_text_snapshot_order.py`입니다. 공개 후보는 HEAD의 같은 파일을 사용하며 제품 routing JS/provenance·Native·대규모 WIP를 포함하지 않습니다. 위 최신 e774의 실제6개 fresh lifecycle/독립 검증 및 JS5개 결과는 main의 별도 통합 증거이며, 공개 Python 검사만으로 다시 실행한 결과로 표현하지 않습니다.

2026-10-25에는 선행 `pic`도 동일한 불투명 객체 슬롯으로 독립 검사에 연결했습니다. 그림 내부 XML과 BinData는 그대로 보존해야 하며, 그림 크기나 렌더링 의미를 해석한 것으로 보지 않습니다. `tests/hwpx/leading_object_picture_tests.py`의 6개 반례는 그림 1~3개, namespace alias, 원본만 이용한 선택, 잘못된 좌표·텍스트, 그림 XML·바이너리 변경, foreign namespace·switch 거부를 검사합니다. 일반/최적화 각각 6/6이며 기존 적대 검사 19개도 함께 재실행합니다. 기존 전수 감사의 unsupported 결과는 소급 변경하지 않습니다.
