# 전체 Contents의 Grid 셀 반환값 대조

이 문서는 셀, Prelude, 셀 이후 전환 Backdrop의 전체 조립 반환값 검사를 소유합니다.

## 후속: 전환 Backdrop 반환값

전체 조립 probe는 `prefix.transition.backdrop`과 `transition.raw`를 기존 `chart-backdrop-probe.zig`에서 분리한 결과 serializer에 전달합니다. 입력 재파싱으로 실제 반환값을 대체하지 않습니다. Backdrop의 ID 3개, raw50/34/4, fill suffix, 종료 위치, 전환 raw26과 전환 자체의 종료 위치를 독립 JS `chartBackdropOracle`과 대조합니다. 같은 위치여도 Backdrop.end와 transition.end는 별도 반환 필드로 직렬화합니다.

`chart-backdrop-variant.mjs`가 원시 구간 및 suffix 변형을 소유하며 기존 개별 검사와 전체 조립 검사가 공유합니다. 제품의 필드 의미 해석이나 지원 배치를 변경하지 않습니다.

이번 확장 후 Debug·ReleaseSafe·ReleaseFast 각각 전체 조립 정상·변형 1,452건, 기본 거부 946건이 통과했습니다. ReleaseSafe의 원본 43개 Contents 모든 잘림은 382,411개 위치이며, 기타 오류를 합한 거부 383,314건이 통과했습니다. 이는 경로 기준 표본 수이고 모든 합성 입력의 모든 위치를 자른 결과는 아닙니다. 각 거부 뒤 원본 반환 wire를 재대조합니다.

개별 Backdrop ReleaseSafe 검사는 정상 129건·거부 8,944건 통과했습니다. HEAD와 현재 개별 검사 결과 및 호출열 18,017개가 동일하며 `(mode, limit, input length, input bytes)` SHA-256은 `2fcf2b46ffbbd37fa93b8f33a04bdf039a86806fdeed04795e46b10580a5c44f`입니다. JS oracle 자체는 이번에 변경하지 않았습니다.

임시 코어 복사본에서 ID 3개를 각각 변경, raw_backdrop/raw_fill/raw_picture를 각각 초기화, suffix 변경, Backdrop.end와 transition.end를 각각 변경하는 9종 결함을 주입했습니다. 세 모드 총 27개 모두 컴파일 종료 코드 0 후 실제 반환값 대조의 `ERR_ASSERTION`·실행 종료 코드 1로 검출했습니다. 로그는 `/tmp/hwpjs-transition-mutants.eyK3yx`의 `종류-모드.compile.log`·`종류-모드.log`이며 임시 파일의 영구 보존을 보장하지 않습니다. 제품 소스에는 결함을 반영하지 않았습니다.

검사기 자체의 동일 메시지 RuntimeError/TypeError/RangeError 3종 및 반환 바이트 변조 8종 검출도 다시 통과했습니다. 이번 확장은 기존의 선택된 empty-Picture 전환에 한정합니다. 이후 개별 타입/객체 값 검사는 [사전 엔트리 대조](hwp5-chart-observed-tables.md)에 연결했으며 다른 중첩 필드 검사는 남아 있습니다. 현재 누적 변경의 세 모드 전체 audit 완료 여부는 각 파트의 단독 실측과 구분합니다.

## 범위와 SSOT

[Grid 셀 파서](hwp5-chart-grid-cells.md)의 기존 probe에서 결과 직렬화를 추출해 전체 Contents mode 336에서도 재사용합니다. `gridCellsWire`는 독립 Grid 관측 결과로 기대 바이트를 만듭니다. 전체 조립에서는 끝까지 읽은 타입 테이블 크기를 전달하고, 개별 Grid 검사에서는 Grid 종료 시점의 크기를 사용합니다.

행·열·셀 수, 셀 payload 종료 위치, Grid 문자열 바이트 수, 각 셀의 ID/종류/start/end/trailer/원시 값을 대조합니다. 빈 슬롯도 배열 원소로 유지하므로 좌표를 ID에서 복원하거나 null을 제거한 배열로 비교하지 않습니다. 숫자는 부동소수점 연산 없이 원래 64비트 값을 비교합니다.

Grid Prelude의 원시 필드는 아래 후속 절에서 확장합니다. 이후 연결한 [Footnote/Legend](hwp5-chart-observed-initial-text.md)와 [사전 엔트리](hwp5-chart-observed-tables.md)는 각 문서의 실측 및 제한을 따릅니다. 최초 Grid 셀 검사 결과만으로 해당 필드의 검증을 대신하지 않습니다.

## 공유 입력 변형

`chart-grid-cell-variants.mjs`가 기존 개별 검사와 전체 조립 검사의 값 변형을 공유합니다. 숫자가 있는 표본에서는 +0, -0, 양의 무한대, payload가 있는 NaN, 모든 비트가 1인 값을 넣고 trailer를 0x1234로 바꿉니다. 표본의 첫 비-null 문자열 셀도 0xa5 바이트로 채웁니다. 이 첫 셀이 문자열이라는 시험 전제는 명시적으로 확인합니다. 모든 Grid 배치의 첫 비-null 값이 문자열이라고 제품에 강제하지 않습니다.

원본 파일을 수정하지 않고 입력 Buffer만 변경합니다. 기존 셀과 같은 길이의 변형이므로 타입 참조·문자열 길이·Contents extent를 임의로 바꾸지 않습니다.

## 실측

ReleaseSafe 전체 조립 probe에서 정상·변형 1,065건과 기본 오류 946건이 통과했습니다. 모든 잘림 실행은 잘림 382,411건, 다른 오류를 합쳐 거부 383,314건과 정상·변형 1,065건을 통과했습니다. 거부 뒤 원본 반환 wire도 재대조합니다.

기존 개별 Grid 검사는 43차트·750슬롯·51null·ID와 위치가 다른 10슬롯에서 정상 291건·오류 28,765건을 통과했습니다. HEAD 함수와 추출 후 함수를 같은 새 ReleaseSafe 전체 probe로 실행했으며 57,821개 호출의 mode·limit·입력 길이·바이트 순서 및 결과가 같습니다. SHA-256은 `bd0a33775aba4b29e17e19ebec54d5d3286b143c574ff344630e466eb7dcde1d`입니다.

별도로 HEAD의 Grid oracle과 공통 wire 추출 후 oracle을 원본·값 변형 291건에서 비교해 반환 필드·Map·Buffer·wire 전체가 같음을 확인했습니다.

## 적대적 검증

`/tmp/hwpjs-grid-return-mutants.bmn8Fb`의 임시 코어 복사본에 숫자 bits/trailer 삭제, 문자열 bytes 삭제/trailer 손상, null 슬롯 ID 손상, 첫/마지막 셀 교환, 중간 셀 start 손상, 마지막 셀 end 손상, rows/columns 손상의 10종을 주입했습니다. 반환 직전 결과를 손상시켜 원래 입력과 이미 등록된 객체 테이블이 그대로여도 Grid 반환값 손실을 검출하는지 확인했습니다. 제품 소스는 변경하지 않았습니다.

Debug·ReleaseSafe·ReleaseFast의 30건 모두 컴파일 성공 후 실제 대조의 ERR_ASSERTION·종료 코드 1로 실패했습니다. 정상 코어의 작은 mode 336 bridge는 세 모드 각각 정상·변형 1,065건과 기본 오류 946건을 통과했습니다. compile/run 로그는 위 임시 경로의 `*.compile.log`·`*.log`에 있습니다. 선택한 위치의 손상을 확인한 것이며 모든 셀 위치에 모든 손상을 주입했다고 확대하지 않습니다.

확장된 smoke는 정규 audit에 연결됐고, 이후 Footnote/Legend 및 사전 엔트리까지 포함한 누적 세 모드 전체 audit가 통과했습니다. 최종 수치와 로그는 [사전 엔트리 대조](hwp5-chart-observed-tables.md)가 소유합니다.

## 후속: Prelude 반환값

기존 `chart-grid-prelude-probe.zig`의 결과 직렬화와 독립 `gridPreludeWire`를 전체 조립에도 연결했습니다. prefix 36바이트, root/grid/collection 원시 word, 행·열, 셀 **시작** 위치, 타입 수·타입 이름 바이트 수를 대조합니다. Grid 셀의 payload_offset(셀 뒤 위치)과 Prelude의 payload_offset(셀 앞 위치)을 서로 대신하지 않습니다.

`gridPreludeWire`는 실제 표본의 고정 배치·오프셋을 전제로 하는 시험 helper입니다. 전체 조립은 최종 타입 테이블로부터 기대 타입 수와 이름 바이트 총계를 구하고, 개별 Prelude 검사는 기존 5개·50바이트 전제를 유지합니다. 타입별 ID·이름·버전 일치를 총계로 대신하지 않습니다.

`gridPreludeRawVariant`가 두 검사의 원시 prefix/word 변형을 공유합니다. 앞 32바이트는 0xa5, root word는 0xffffffff, grid word는 42, collection word는 65535로 바꾸며 extent는 유지합니다. 이 word에 객체 ID·개수 의미를 새로 부여하지 않습니다. 제품 소스는 변경하지 않았습니다.

ReleaseSafe 전체 조립의 후속 결과는 정상·변형 1,108건, 기본 오류 946건입니다. 모든 잘림 382,411건과 기타 오류를 합한 거부 383,314건도 통과했습니다. 기존 Prelude 검사는 새 전체 ReleaseSafe probe에서 정상 473건·거부 6,493건(68바이트 wire)을 통과했습니다. HEAD 함수와 추출 후 함수의 결과 및 13,459개 호출의 mode·limit·입력 길이·바이트 순서가 같고 SHA-256은 `47b3964ba5f62c6bed491e8ad26107d724a375bce978914eb9ccf1fe560d4b6b`입니다.

`/tmp/hwpjs-prelude-return-mutants.PbIxqp`의 임시 코어에서 prefix 첫 바이트, 복사된 extent 바이트, root/grid/collection word, payload_offset, 타입 이름 바이트 총계의 7종 손상을 주입했습니다. 세 모드 21건 모두 컴파일 성공 후 실제 wire 대조의 ERR_ASSERTION·종료 코드 1로 실패했습니다. 정상 코어의 작은 mode 336 bridge는 세 모드 각각 정상·변형 1,108건·기본 오류 946건을 통과했습니다. compile/run 로그는 위 임시 경로에 있습니다. 이 추가 단계도 전체 audit 완료로 계산하지 않습니다.
