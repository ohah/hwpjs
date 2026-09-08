# ICC 확장 목표의 전체 최근접 출력 선택

## 계약과 SSOT

`parametric_nearest.selectWide(precision,curve,target)`는 u512 목표에 가장 가까운 실제 출력 후보를 선택합니다. selected의 유리수는 u512, power_endpoint는 기존 출력 식과 실제 witness입니다. 서로 다른 같은 거리 출력은 tie, 최근접 값이 도달되지 않으면 unattained, 필요한 비교가 미확정이면 undecided입니다. tie는 source branch 순서이며 임의 숫자 우선순위를 적용하지 않습니다. witness는 F.1의 선호 입력이 아닙니다.

비단조·상수 곡선도 출력 집합 검색은 가능하므로 여기서 역변환 적격성을 요구하지 않습니다. 전체 정의역 검증은 먼저 수행합니다. 하위 선형 범위에 목표가 실제 포함되면 상위의 불필요한 비교 미확정을 거치지 않고 목표를 반환합니다. 전체 고정밀 역변환 연결·제품 JS API·HWP 렌더링은 후속 범위입니다.

기존 [최근접 출력 선택](icc-parametric-nearest.md)과 selectFor가 같은 흐름을 사용합니다. rational_interval_nearest.project는 target 또는 endpoint(Candidate)를 구분합니다. 큰 목표를 u256 끝점에 넣지 않습니다. endpoint는 원래 u256 범위 끝점이므로 [고정밀 거리 비교](icc-extended-ordinate-distance.md)에 그대로 전달합니다. 기존 candidate API도 같은 판정을 쓰고 target만 u128에서 u256으로 올립니다.

구간 좌표를 목표에 충분한 폭으로 올린 뒤 포함 여부는 기존 unit_interval.contains만 호출합니다. SSOT 재검토에서 발견한 포함 조건식 중복을 제거했으며 수정 전 Debug audit는 명시적으로 중단·대체했습니다. 그 로그는 최종 통과 증거로 사용하지 않습니다.

power_range_nearest.selectWide는 기존 출력 범위 factory·연속성·양 끝 판정과 [고정밀 출력 비교](icc-extended-ordinate-order.md)를 공유합니다. 결과 타입 Of는 목표/결과 유리수 폭을 소유하고 power endpoint는 복제하지 않습니다. candidates의 linearFor/combineFor가 기존·확장 후보 조합을 공유합니다. 동률이면 미도달 선형 후보보다 실제 power 출력을 우선하고 같은 방향·같은 거리이면 중복 제거, 반대 방향이면 두 후보를 보존합니다. 좁히는 cast·실수 근사·파일 접근·할당은 추가하지 않습니다.

## 독립 검사와 wire

mode234 입력은 precision+n/d u512의 132바이트 BE prefix와 para 태그입니다. status 0=unattained, 1=undecided는 4바이트, 2=rational은 132바이트, 3=power endpoint는 기존 88바이트, 4=tie는 216바이트입니다. tie는 status 뒤 n/d u512 128바이트와 power endpoint 84바이트입니다. 기존 mode211과 probe·serializer를 공유하며 기존 형식은 유지합니다.

JS는 독립 선형/거듭제곱 출력 범위와 유리수 최근접 집합 기준을 구성합니다. 원본 분기의 도달 여부·power witness, 다섯 curve 유형·양/음/영 계수·지수·비활성 분기·열린 끝·점프·동률·중복·미확정·잘림·오류 후 복구를 검사합니다. 최대 u512 분모의 중점 양옆과 큰 비축약 동률도 추가했습니다. 기존 직접 결과는 selected=7,725/ties=180/unattained=294/rejected=4,882/undecided=1, 확장은 7,758/181/296/4,978/1입니다.

확장 네이티브는 큰 목표 보존, 열린 interval의 target/endpoint, 양 끝 포함 여부, 중점 이웃의 다른 선택, 동률·미도달·중복, 전체 정의역 선행 검증, 512비트 비축약 목표의 하위 정확 일치와 진짜 미확정을 검사합니다.

## 적대적 검사와 발견한 테스트 빈틈

동률 한쪽 제거, 미확정을 unattained로 변경, unattained를 selected로 위장, 큰 좌표 잘림의 네 출력 변형을 ERR_ASSERTION으로 검출했습니다. 임시 소스에서 같은 출력의 중복 제거를 끄자 초기 네이티브는 Debug·ReleaseSafe에서 union 접근 오류를 냈지만 ReleaseFast는 잘못된 분기 접근을 검증하지 못하고 통과했습니다.

기존·확장 중복 제거 테스트에 selected 및 rational 태그의 명시적 검사를 추가했습니다. 재실행한 임시 변형은 세 모드 모두 당시 5개 중 1개가 assertion 실패로 검출됐습니다. 최종 로그는 `/tmp/hwpjs-extended-nearest-mutant-{Debug,ReleaseSafe,ReleaseFast}-final.log`입니다. 초기 Fast 통과는 유효한 검증으로 세지 않습니다. 이후 interval projection 테스트를 추가했으며 제품에 변형은 남기지 않았습니다.

공통 contains 재사용과 interval projection 검사를 반영한 최신 임시 복사본에서도 세 모드 모두 6개 중 1개가 assertion 실패로 검출됐습니다. 현재 코드 기준 로그는 `/tmp/hwpjs-extended-nearest-mutant-{Debug,ReleaseSafe,ReleaseFast}-current.log`입니다.

## 실제 ICC 대조

시스템 para TRC 15개의 type0/type3·양의 g/a·type3 양의 하위 기울기·내부 시작점·a+b=65536을 확인했습니다. 전체 곡선의 x=0/1에서 출력 0/1이 실제 존재하므로 최대 u512 분모의 목표 0/1에 대해 해당 분자·분모를 그대로 반환하는지 확인했고 30건이 일치했습니다. 최근접 검색은 단조성 gate가 아니므로 비단조 프로파일을 역변환 가능하다고 인증하지 않습니다. 이 수동 건수는 정규 audit에 합산하지 않습니다.

## 최종 감사

SSOT 수정 후 Debug·ReleaseSafe·ReleaseFast 전체 audit는 모두 종료 코드 0, 20/20 단계, 네이티브 676/676, WASM checks=6,978,603으로 통과했습니다. 이전 6,965,389에 신규 13,214회 호출이 추가됐습니다. 최종 로그는 `/tmp/hwpjs-extended-nearest-{Debug,ReleaseSafe,ReleaseFast}-final.log`입니다. 수정 전 중단 로그는 이 결과에 포함하지 않습니다.

최종 세 모드 산출물의 신규 직접 대조와 네 출력 변형 검출도 모두 통과했습니다. 변경 Zig 포맷·JS 문법·diff 공백·문서 로컬 링크 7개를 확인했습니다. 최종 재검토에서는 전체 정의역 선행 검증, 목표와 끝점의 타입 분리, contains의 단일 소유자, 미도달·미확정 구분, 실제 후보의 동률 우선권, 동일 출력 중복 제거, 원래 큰 목표 보존, witness와 F.1 입력의 구분, 기존 wire 계약·출력 초기화를 확인했습니다. 고정밀 전체 역변환 연결과 전체 HWP/HWPX 문서 검증은 여전히 미완료입니다.
