# Series 조립과 Title 헤더 코어

## 선택한 범위

[계열 반복 조사](hwp5-chart-series-collection-evidence.md)의 연속 경계를 Zig 코어로 연결합니다. `Contents`의 선택된 Series v2 직렬화이며 모든 Chart 버전·배열 형태를 자동 해석하는 파서가 아닙니다. 호출자가 계열별 Point 개수를 명시적으로 전달합니다. 배열의 두 word를 보존하며 그 값에서 일반적인 개수 규칙을 추론하지 않습니다.

한 Series는 접두부 → 지정된 수의 Point → raw66·필수 String 참조·Label → nullable TextBlock·raw word·nullable TextFormat 두 개 → raw40·빈 Picture → raw106 순서입니다. raw word는 Format 개수가 아닙니다. raw106은 원문으로 복사하며 내부 필드 의미는 여전히 미확정입니다. Picture의 non-null 데이터는 기존 선택형 파서와 동일하게 미지원입니다.

계열 반복은 지정된 모든 Series를 소비한 다음 inline `VtChartTitle` v1 **헤더까지만** 읽습니다. 클래스·버전·객체 식별자를 확인하고 Title 본문은 소비하지 않습니다. 실패 후 다음 타입을 검색하거나 재동기화하지 않습니다.

## 책임·수명·실패 계약

코드 경로는 `src/hwp5/chart/` 기준입니다.

- `series_label_section.zig`: Point 목록과 raw66·String 참조·Label을 소유합니다. `Section.deinit()`은 Point 배열만 해제합니다.
- `series_suffix.zig`: TextBlock·원시 word·두 Format의 조립 순서를 소유합니다. 본문·문자열·타입 읽기는 기존 공통 파서를 사용합니다.
- `series.zig`: 위 구간과 기존 Series 접두부·Picture를 조립하고 raw106을 복사합니다. `Series.deinit()`은 Section 소유 메모리를 해제합니다.
- `title_header.zig`: Title 객체 ID와 클래스·버전만 읽습니다.
- `series_collection.zig`: 계열별 Point 개수 목록에 따라 Series 목록과 뒤의 Title 헤더를 조립합니다. `Collection.deinit()`은 각 Series와 목록을 해제합니다.

반복마다 같은 타입·객체 테이블을 전달하여 앞 계열의 문자열 참조와 전체 객체 ID 중복 검사를 유지합니다. 반환 객체의 raw 배열은 복사본이며 String은 호출자가 유지해야 하는 입력 버퍼를 빌립니다. 테이블 자체는 호출자가 소유합니다.

모든 새 진입점은 실패 시 외부 Reader 위치를 유지하고 자신이 할당한 부분 결과를 해제합니다. 타입·객체 테이블은 실패 도중 변경됐을 수 있으므로 둘 다 폐기해야 합니다. 이것은 테이블까지 되돌리는 트랜잭션 계약이 아닙니다.

`Options`는 최대 계열 수·계열별 Point 수·본문 문자열 제한·Format code 제한을 구분합니다. 계열 수와 모든 Point 수를 먼저 검사한 뒤 조립합니다. 객체 총수·저장 문자열 총량·타입 제한은 공통 테이블이 소유합니다. 별도의 불명확한 총합 제한을 만들지 않습니다. 기본 최대 계열 수와 계열별 Point 수는 각각 65,535이며 호출자가 작업에 맞게 낮출 수 있습니다.

기존 첫 계열의 테스트용 증분 조립기는 중간 단계 상태를 검증하기 위해 유지합니다. 제품 필드 읽기를 별도로 복제하지 않으며, 새 조사 oracle은 제품 코드로 기대값을 생성하지 않습니다.

## 확인한 검증

독립 native fixture는 신규/기존 타입, offset 0/1/17/257, 계열 수 0/1/2/3, 혼합 Point 수 0/1/4, ID 0·희소 타입 ID·이전 String 별칭·null code/text·서로 다른 원문을 사용합니다. 배열 word가 서로 달라도 호출자의 명시적 Point 개수로 읽는 계약을 검사합니다. 4개 신규 native 테스트는 모든 바이트 잘림, 전체 객체 ID 중복, Title null ID·클래스·버전, 각 제한, 구성 요소별 실패 커서, OOM 및 명시적 안전 할당자의 정상·후기 오류 정리를 포함합니다. 세 모드 모두 신규 테스트 4개와 root 테스트가 통과했습니다.

테스트 전용 mode 331은 기존 선행 구간을 읽은 다음 전체 계열 조립기를 호출합니다. 독립 JS oracle과 모든 계열의 접두부·Point/Label 본문·꼬리 문자열·TextBlock/Format·Picture·raw106·끝 위치·최종 테이블 수치를 바이트 대조합니다. 객체/문자열 수치는 이 wire에서 최종 범위 기준이며 기존 증분 probe의 중간 수치와 혼동하지 않습니다.

ReleaseSafe 실제 WASM 대조: 차트 43개, Series 213개, Point 16개, 성공 변형 172건·거부 148,209건. 거부는 계열 시작부터 Title 헤더 끝까지 잘림 147,396건을 포함합니다. 정확한 끝, 뒤쪽 바이트 무관성, raw106 변형, 잘못된 계열 수, 객체 제한, null·중복 ID, Title 클래스·버전과 매 거부 후 원본 재파싱을 확인했습니다.

추가로 같은 메시지의 WebAssembly.RuntimeError·TypeError·RangeError를 주입하면 거부 검사 자체가 AssertionError로 실패했고, 정상 wire 바이트 변형도 검출됐습니다. 조사 테스트 50개도 통과했습니다.

코어 결함 12종(다섯 구성 요소의 커서 변경, raw106 과소비·원문 삭제, 반복 결과·단일 Series의 후기 해제 누락, Point 반복 누락, Title ID 등록 삭제·버전 변경)을 세 모드에 각각 주입했습니다. 36개 모두 컴파일 성공 후 실제 테스트 실패·종료 코드 1로 검출했습니다. ReleaseFast에서도 명시적 안전 할당자가 해제 누락을 검출합니다. 로그는 `/tmp/hwpjs-series-collection-core-mutants.l5H52o`에 있으며 재현 입력으로 요구하지 않습니다.

Debug·ReleaseSafe·ReleaseFast 전체 audit가 모두 종료 코드 0으로 끝났습니다. 각 모드에서 27/27 단계, native 1,068/1,068개, WASM 검사 8,833,246회, imports 0입니다. mode 331의 계열 반복 대조는 정규 audit에 포함합니다. 로그는 `/tmp/hwpjs-series-collection-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.

### 제한값 전달 테스트의 위치 편향 보강

전체 audit의 소스를 고정한 동안 별도 복사본에서 추가 결함을 확인했습니다. Series가 뒤쪽 TextBlock으로 본문 제한값을 전달하지 않도록 바꿔도 기존 native 테스트는 세 모드 모두 통과했습니다. 앞쪽 Label에서 먼저 제한 오류가 나므로 뒤쪽 전달 결함을 구분하지 못했습니다. 실제 제품 코드는 제한값을 전달하고 있어 제품 버그가 아니라 검증의 누락이었습니다.

본문 전체 길이 제한 3으로 Label의 이름 2+본문 2바이트를 거부하는 사례와, 제한 4에서 Label은 통과하되 뒤쪽 TextBlock만 이름 2+본문 3바이트로 초과하는 사례를 추가했습니다. 보강한 테스트에서는 동일 결함이 세 모드 모두 실제 `ExpectedCollectionRejection` 실패·종료 코드 1로 검출됐습니다. `limit-before`·`limit-after` 로그는 위 결함 주입 디렉터리 아래에 있습니다. 이 추가 변형까지 합쳐 13종의 결함을 검출했습니다.

전체 audit 종료 후 이 두 native 사례를 본 저장소에 반영했습니다. 제품 코드·WASM probe·독립 oracle은 바꾸지 않았으며, 보강된 native 전체 테스트 1,068개를 세 모드에서 다시 실행해 모두 통과했습니다. 새 오류 사례의 OOM 및 명시적 안전 할당자 검사도 포함합니다. 최종 ReleaseSafe 제품 빌드는 5/5 단계 성공입니다. 후속 native 로그는 `/tmp/hwpjs-series-collection-{Debug,ReleaseSafe,ReleaseFast}-native-final.log`입니다.

## 남은 작업

raw106 내부 필드 해석, Title 본문과 이후 Chart 데이터, 자동 버전·배열 형태 선택, 일반 문서 API 연결, 렌더링·편집·무손실 저장은 미완료입니다. OOXMLChartContents/HWPX 지원을 이 작업의 결과로 주장하지 않습니다.

다음 조사 후보를 읽기 전용으로 확인했습니다. 43개 모두 Title 헤더 직후는 알려진 `VtChartText` v1 타입이며, 그 다음 inline TextBlock ID를 등록한 뒤 기존 본문 조사기를 적용하면 190/180/146바이트 본문(각 1/1/41개)을 지나 `VtChartSection` v1 타입에서 멈춥니다. 이후는 모두 242바이트가 남습니다. 이 후보에 대한 잘림·참조·버전 변형 검증과 코어 연결은 아직 하지 않았으므로 Title 구현 완료의 증거가 아닙니다.

이어서 기존 Footnote의 ChartSection 순서를 엄격히 적용한 읽기 전용 후보 검사에서는 43개 모두 164바이트를 소비하고 78바이트가 남았습니다. 남은 원문에 `VtList`·`VtWindow` 선언이 보이나 해당 경계·필드·버전은 다음 조사 대상입니다. 숫자나 이름의 출현만으로 일반 파싱 규칙을 확정하지 않습니다.

위 후보의 후속 잘림·참조·버전 검증 결과는 [Title의 ChartText·ChartSection 구간 조사](hwp5-chart-title-body-evidence.md)가 소유합니다.
