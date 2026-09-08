# ICC 태그 내용 공통 분기

`tag_payload.parse(signature,data,edition,options)`는 XYZ·TRC·v4 다국어 문자열·v4 색순응 행렬의 기존 파서를 연결합니다. 실제 파싱 규칙과 서명 목록은 각 파서가 계속 소유합니다. 새 모듈은 typed 결과와 호출 순서만 소유합니다.

결과는 xyz/trc/localized/adaptation, v2 description_v2/copyright_v2, 해당 판본 미구현 unsupported_edition, 서명 미구현 unhandled로 구분합니다. [v2 문자열 연결](icc-v2-text.md) 이후 desc/cprt는 별도 타입으로 읽으며 chad는 여전히 미지원입니다. 그 밖의 알려진 잘못된 타입·길이·한도 오류를 unknown이나 성공으로 바꾸지 않습니다. LUT 등 미구현 태그는 unhandled입니다. 아래 초기 통합 검증 기록의 v2 미지원 결과는 당시 범위입니다.

이 계층은 전체 프로파일·태그 의미 검증이 아닙니다. XYZ 원값을 보존하고 클래스별 수치 정책은 적용하지 않습니다. TRC 계산 모델·색순응 의미·다국어 문자열 Unicode/locale/확장 영역 보류를 기존 결과 그대로 전달합니다. 문자열과 샘플 곡선의 view는 입력 태그 데이터를 빌리며 새 할당은 없습니다.

## 검증 진행

신규 테스트는 미지 서명·v2 미구현·알려진 잘못된 타입의 구분, 음수 XYZ 원값, TRC 채널과 보류, borrowed 다국어 view·한도, 색순응 행렬 보류를 확인합니다. 결과 union 태그를 먼저 검사합니다. 테이블 순회·Unicode 및 문맥별 검사·PNG 보고서 연결은 아래처럼 구현 중이며, WASM 독립 대조·세 모드 감사·최종 적대적 검증은 아직 남아 있습니다.

첫 전체 Debug 네이티브 실행은 5/5 단계, 698/698 테스트로 통과했습니다.

## 프로파일 단위 집계와 PNG 연결

`payload_inspection.inspect`는 명시한 판본과 실제 헤더의 일치를 검사하고 기존 태그 파서·Unicode 검사·v4 XYZ 문맥 검사를 조립합니다. 반환값은 스칼라 보고서이며 입력 버퍼를 참조하지 않습니다. 해석하지 못한 서명과 미지원 판본은 별도 집계하고, 전체 의미 검증 보류는 유지합니다. locale·계산 모델·LUT 의미 검증 완료를 뜻하지 않습니다.

바이트·문자열 레코드·Unicode 처리 한도는 프로파일 전체에서 합산합니다. 두 태그 서명이 동일한 저장 영역을 공유해도 각 descriptor의 처리량을 차감합니다. 단일 mluc 내부의 완전히 같은 문자열 범위만 기존 Unicode 검사기가 중복 제거합니다. 따라서 집계값은 파일의 고유 저장 바이트 수가 아닙니다.

PNG의 `Options.profile.payloads`는 기본 null(검사 미선택)이며 선택 시 값 타입 보고서를 원본 프로파일 정리 후에도 보존합니다. 의미 보류와 ancillary 보류 건수는 없애지 않습니다.

집계 네이티브 테스트는 공유 데이터의 정확한 한도/한도 초과, 판본 불일치·v2 미지원, 잘못된 UTF-16·알려진 타입 오류 전파, display 백색점 검사·음수 행렬 열 보존·미지 태그 보류를 확인했습니다. 이 시점 전체 Debug 테스트는 701/701로 통과했습니다.

PNG 연결 테스트의 첫 할당 실패 주입 실행에서는 테스트가 LimitExceeded만 기대하여 OutOfMemory를 오판했습니다(701/702). 테스트 보조 함수가 주입된 OutOfMemory를 할당 실패 검증기에 전달하도록 수정했습니다. 수정 후 전체 Debug는 5/5 단계, 702/702 테스트로 통과했습니다. 성공 및 오류 처리의 할당 실패 지점, 보고서 수명, 기본 미선택, 한도와 판본 오류를 확인했습니다. WASM 독립 대조·세 모드 전체 감사는 아직 실행하지 않았습니다.

## WASM 독립 대조 진행

mode241은 선택 여부·판본의 2바이트와 바이트/레코드/Unicode 한도의 u32 BE 3개 뒤 전체 PNG를 받습니다. 결과는 u32 LE 18개(72바이트)로 프로파일 존재·검사 선택·색 의미 보류·ancillary 보류 다음 태그 집계 보고서를 반환합니다. 기존 mode239/240은 유지합니다.

Debug WASM 직접 실행은 신규 7비교/265거부, 기존 필수 태그 265비교/141거부, 기존 프로파일 43승인/288거부로 통과했습니다. 독립 JS fixture와 고정 기대값으로 혼합 태그·역순·명시적 판본·검사 미선택·프로파일 부재·정확한 한도와 초과·오류 후 재사용·모든 접두 잘림을 확인했습니다. 신규 검사는 정규 audit에도 연결했습니다.

검사 선택 표시, 누적 태그 바이트, Unicode 바이트, 전체 의미 보류를 각각 0으로 바꾸는 출력 변형 4종을 모두 ERR_ASSERTION으로 검출했습니다. 세 모드 전체 감사는 `/tmp/hwpjs-payload-{Debug,ReleaseSafe,ReleaseFast}.log`로 순차 실행 중이며 아직 완료 결과가 아닙니다.

파서 오류를 삼키고 성공 버퍼를 반환하는 다섯 번째 변형도 ERR_ASSERTION으로 검출했습니다. 이는 테스트 경계의 변형 검출 결과이며 제품 소스 자체를 변형한 시험은 아닙니다.

임시 복사 `/tmp/hwpjs-payload-mutant.WYPcGA/src`에는 Unicode 검사 한도를 이전 태그 처리량만큼 차감하지 않는 소스 결함을 주입했습니다. Debug·ReleaseSafe·ReleaseFast 모두 shared payload work budgets 테스트가 잘못 승인된 4바이트 처리량(한도 3)을 TestExpectedError로 검출했습니다. 필터 실행은 루트 테스트 블록 포함 3통과/1실패이며 로그는 `/tmp/hwpjs-payload-mutant-{Debug,ReleaseSafe,ReleaseFast}.log`입니다. 제품 소스는 변형하지 않았습니다.

macOS의 실제 v4 RGB 프로파일 Display P3·ACESCG Linear·DCI(P3) RGB·ROMM RGB·ITU-2020·ITU-709를 읽기 전용으로 PNG에 넣어 검사했습니다. 각 10개 태그의 원본 서명·길이·문자열 레코드를 JS에서 별도 순회하여 WASM 집계 18필드와 대조한 6건이 통과했습니다. 모든 서명이 분기되었어도 의미 보류는 유지되며, OS 색상 변환 또는 HWP 전체 검증을 입증하지 않습니다. 수동 6건은 정규 audit 건수에 합산하지 않습니다.

ReleaseSafe·ReleaseFast 감사용 WASM 산출물에서도 신규/기존 직접 대조, 경계 변형 5종 검출, 실제 프로파일 6건 대조가 각각 통과했습니다.

## 최종 감사

Debug·ReleaseSafe·ReleaseFast 전체 감사는 순차 실행한 상위 프로세스 종료 코드 0, 각 20/20 단계, 네이티브 702/702, WASM checks=6,993,465로 모두 완료했습니다. 이전 6,993,193에 신규 272건이 추가됐습니다.

커밋 전 마지막 `zig build test --summary all`도 702/702로 통과했고, 이어서 `zig build -Doptimize=ReleaseSafe --summary all`이 5/5 단계로 통과했습니다.

최종 재검토에서는 기존 태그 파서와 Unicode/XYZ 검사 재사용, 명시적 판본·미선택/미지원 구분, 전체 처리량 한도, 알려진 오류 전파, 소유권 정리 후 스칼라 보고서 수명, 기존 probe 보존을 확인했습니다. 이번 범위에서 추가 제품 결함은 발견하지 못했습니다. 변경 Zig 포맷·JS 문법·diff 공백·문서 로컬 링크 17개도 통과했습니다. 태그별 전체 의미·locale·LUT·v2 미지원 태그·색상 변환 및 HWP/HWPX 전체 문서 검증은 여전히 미완료입니다.
