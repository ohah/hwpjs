# 전체 Contents의 사전 엔트리 대조

범위는 [명시적 배치의 Contents 조립](hwp5-chart-observed-contents.md)이 반환하는 사전입니다. 엔트리 수·이름/문자열 바이트 총계만 일치하는 것으로 개별 엔트리 일치를 대신하지 않습니다.

## 타입 사전

`chart-type-table-wire.zig`는 실제 반환된 `prefix.grid.prelude.types.definitions`를 읽습니다. u32 ID 오름차순으로 정렬하고 엔트리 수, 각 ID(u32)·버전(u16)·이름 길이(u32)·원시 이름 바이트를 직렬화합니다. 정렬은 테스트 wire의 규칙이며 제품 HashMap의 순서를 계약으로 만들지 않습니다. 이름의 NUL 종결 바이트도 대조에 포함합니다.

JS `chart-type-table-wire.mjs`는 독립 관측에서 누적한 최종 `tail.types`를 같은 숫자 순서로 직렬화합니다. 제품 출력에서 기대값을 만들지 않습니다. 초기 타입 버전은 기존 oracle의 선택된 배치 검증 및 클래스별 버전 전제, 후속 타입은 관측된 선언에서 가져옵니다. 모든 버전의 임의 차트를 자동 인식하는 oracle이 아닙니다.

전체 mode 336 검사에 연결했으며, 제품 타입 파서와 개별 타입 probe의 wire는 변경하지 않았습니다. 이 검사 때문에 제품의 할당·파일 접근·WASM 공개 API 계약을 변경하지 않습니다.

### 실제 결함 주입

반환 직전 제품 코어의 임시 복사본에서 ID 정렬 기준 첫·중간·마지막 엔트리에 각각 이름 첫 바이트 변경, 버전 변경, ID 이동을 적용했습니다. 이름 변경은 길이를 유지하고 ID 이동은 엔트리 수를 유지합니다. 세 모드 각각 9종, 총 27건이 컴파일 종료 코드 0 뒤 실제 wire 대조의 `ERR_ASSERTION`·종료 코드 1로 검출됐습니다.

ReleaseSafe 첫 표본에서 9종 모두 **기존 wire 구간은 기대값과 동일하고 새 타입 엔트리 구간만 다름**을 별도로 확인했습니다. 기존 총계 검사가 이 결함들을 검출하지 못했다는 실제 재현이며, 새 검사의 실패를 앞선 다른 반환 필드 손상 때문으로 오인하지 않았습니다. 모든 엔트리의 모든 바이트에 결함을 주입한 것은 아닙니다.

Debug·ReleaseSafe·ReleaseFast의 무변조 대조군은 각각 기존 43개 Contents 경로에서 정상·변형 1,452건 및 기대 오류 거부 946건을 통과했습니다. 경로 수는 고유 해시 수가 아닙니다. 로그는 `/tmp/hwpjs-type-entry-mutants.vSfrcv`의 `종류-모드.compile.log`·`종류-모드.log`이며 임시 파일 보존은 보장하지 않습니다.

### 타입 wire의 잘림 재검사

타입 엔트리 wire를 포함한 ReleaseSafe의 모든 잘림 재검사도 통과했습니다. 원본 43개 Contents의 382,411개 잘림 위치와 기타 오류를 합한 거부 383,314건, 정상·변형 1,452건입니다. 거부 뒤 원본 wire를 재대조했으며 모든 변형 입력의 모든 위치까지 검사했다는 뜻은 아닙니다.

## 객체 사전

`chart-object-table-wire.zig`는 실제 반환된 `prefix.objects.entries`를 u32 키 순으로 정렬합니다. 키와 명시적인 시험 kind(Other=0, String=1, Number=2)를 기록하며 제품 union 태그의 내부 숫자에 의존하지 않습니다. String은 값 내부 object_id·길이·원시 bytes·u8 trailer, Number는 값 내부 object_id·u64 bits·u16 trailer를 대조합니다. 키와 값 내부 ID가 같을 것으로 기대해도 각각 실제 필드에서 직렬화합니다. 숫자는 부동소수점으로 변환하지 않습니다.

JS `objectTableWire`는 최종 Tail의 객체 ID 집합, Title까지 누적한 문자열 Map, 보조축까지 누적한 숫자 Map을 사용합니다. 현재 선택된 후속 Line/Series/Title/Tail 관측 배치는 새 Double을 도입하지 않습니다. 숫자가 새로 도입되는 배치를 추가할 때는 이 scope 연결도 확장해야 합니다. 문자열·숫자 ID가 객체 집합에 포함되고 두 Map에 중복되지 않는지 검사하며, 값 Map에 없는 등록 ID만 Other로 분류합니다. 이는 독립 관측에 대한 전제이며 제품 사전에서 기대 kind를 복사하지 않습니다.

기존 전체 조립 변형(빈 문자열·길이 65535·NaN payload·무한대·숫자 trailer 등)이 새 사전 wire도 대조하도록 연결했습니다. 세 모드 각각 정상·변형 1,452건과 기본 거부 946건이 통과했습니다.

### 객체 사전 결함 주입

임시 제품 코어에서 반환 직전에 다음 9종을 각각 주입했습니다. String/Number는 해당 종류의 첫 HashMap 엔트리를 선택했으며, 바이트 비우기는 비어 있지 않은 String을 선택했습니다. 특정 키 또는 모든 위치를 검사했다고 주장하지 않습니다.

- String의 값 내부 ID 변경, bytes 강제 비움, trailer 변경, kind를 Other로 변경.
- Number의 값 내부 ID 변경, bits 변경, trailer 변경, kind를 Other로 변경.
- Other 키를 새 ID로 이동하면서 엔트리 수 유지.

세 모드 총 27개 모두 컴파일 종료 코드 0 후 실제 wire 비교의 `ERR_ASSERTION`·실행 종료 코드 1로 검출했습니다. ReleaseSafe 첫 원본 표본에서 9종 모두 기존 반환 wire 구간이 같고 새 객체 사전 구간만 다름을 별도로 확인했습니다. 기존 총계와 다른 반환 객체 비교를 통과하던 사전 손상이 새 비교에서 검출된 재현입니다. 임시 로그는 `/tmp/hwpjs-object-entry-mutants.nXz4CY`의 `종류-모드.compile.log`·`종류-모드.log`이며 제품 소스는 변경하지 않았습니다.

## 남은 범위

객체 사전 wire를 포함한 ReleaseSafe 재검사에서도 원본의 잘림 382,411개 위치, 기타 오류를 합한 거부 383,314건, 정상·변형 1,452건이 통과했습니다. 모든 거부 뒤 원본의 사전 포함 wire를 다시 대조했습니다.

타입/객체 테이블의 allocator/options는 파일에서 복호화한 엔트리 필드가 아니며 이 wire에 포함하지 않습니다. ValueBlock의 반환된 reference start/end는 후속 [축 반환값 대조](hwp5-chart-observed-axes.md)에 연결했습니다. 다른 구조의 참조 메타데이터와 제품 모델이 보존하지 않는 위치는 사전 엔트리와 별개입니다. 독립 oracle이 지원하지 않는 배치까지 사전 검증을 완료한 것은 아닙니다.

이 누적 반환값 확장을 고정한 세 모드 전체 audit 결과는 아래 공통 실측을 따릅니다. 본 결과를 전체 문서 검증 완료로 해석하지 않습니다.

- Debug·ReleaseSafe·ReleaseFast 각각 빌드 단계 32/32, native 1,089/1,089(코어 1,085 + 소유권 4), WASM 검사 8,905,815건, imports 0.
- 로그: `/tmp/hwpjs-chart-return-expansion-{Debug,ReleaseSafe,ReleaseFast}-audit.log`.
