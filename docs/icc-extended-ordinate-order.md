# ICC 확장 목표와 출력값 비교

## 계약과 SSOT

`power_ordinate_order.compareWide(precision,value,target)`는 기존 유리수/거듭제곱 출력과 정규화 u512 목표의 순서를 비교합니다. lt/eq/gt 또는 정밀도 부족 null이며 미확정을 동률로 바꾸지 않습니다. 출력의 유리수는 기존 u256, 거듭제곱 밑은 i128/u128, 지수·offset은 i32입니다.

유리수 출력은 u512로 손실 없이 올려 기존 u1024 교차 곱을 사용합니다. 거듭제곱 임계값은 공통 power_ordinate_rational_order.Of(512)가 offset을 차감합니다. 임계 분자는 signed 514비트, offset 적용 후는 signed 545비트·분모는 unsigned 528비트면 충분하여 i1024/u1024로 계산합니다. 이 정수 폭과 방향성 비교 정밀도 128/256/512/1024는 별개입니다.

compareFor는 기존·확장 경로의 검증과 값 분기를 공유합니다. rational_power_order.Of(1024)는 기존 정의역·부호·역수·정확 동등성·방향성 경계 비교 흐름을 사용하고 큰 비율 초기화만 기존 fractionExtended에 연결합니다. 정확 등식은 rational_power_equality.Of(1024), 방향성 경계는 positive_bounds가 소유합니다. 기존 API와 [기존 출력 비교](icc-ordinate-order.md)는 유지하며 파일 접근·할당·부동소수점 근사를 추가하지 않습니다.

직접 구성한 power 값은 원래 식을 비교하며 자동 클리핑하지 않습니다. 순서 비교는 거리·동률 후보 선택·역함수 입력 선택이 아닙니다. 확장 최근접 출력 검색의 의존 계층이며 아직 검색 전체에 연결하지 않았습니다. 제품 JS API·전체 HWP/HWPX 지원 완료도 의미하지 않습니다.

## 독립 검증

mode232는 precision+n/d u512의 132바이트 BE prefix와 기존 68바이트 출력 표현을 합친 200바이트입니다. 유리수 payload는 n/d u256, power는 밑 i128/u128·g/offset i32·24바이트 0 패딩입니다. 출력 i32 LE는 -1/0/1/2(미확정)입니다. 기존 mode208과 거리 mode210의 parser도 폭별 parseFor를 공유합니다.

JS 독립 기준은 유리수 교차 곱과 정확한 유리수 거듭제곱 비교입니다. 양/음/영 밑·정수/분수/역수 지수·극단 offset·잘림·패딩·태그·잘못된 분수·오류 후 복구를 포함합니다. 최대 u512 분모의 0/1/중간/이웃 목표와 비축약 정확 등식도 확인합니다. 기존 직접 결과는 comparisons=1,350/rejected=474/undecided=1, 확장은 1,441/570/1입니다.

확장 네이티브는 최소 i1024의 절댓값, 1024비트 완전제곱·역수의 정확 등식, 2^1000 및 그 역수의 방향성 경계, 큰 목표·offset, 유리수 출력, 미확정 반례·입력 오류를 검사합니다. 전체 네이티브는 666/666으로 통과했습니다.

순서 반전·동률을 lt로 변경·미확정을 동률로 변경·목표 상위 비트 제거를 ERR_ASSERTION으로 검출했습니다. 임시 소스 복사본에서 offset 차감 부호를 뒤집자 세 모드 모두 4개 중 2개가 실패했습니다. 제품에는 변형을 남기지 않았습니다. 로그는 `/tmp/hwpjs-extended-ordinate-mutant-{Debug,ReleaseSafe,ReleaseFast}.log`입니다.

## 실제 ICC 대조

시스템 para TRC 15개의 양의 지수, type0/type3, type3의 양의 기울기·내부 분기점·a+b=65536·시작 밑 (0,1)을 직접 확인했습니다. type0 시작 출력=0, type3 시작 출력∈(0,1), 마지막 출력=1이라는 독립 기준으로 실제 식과 u512 최대 분모의 목표 0/1을 비교하여 60건 모두 일치했습니다. 전체 곡선 단조성·거리·HWP 렌더링 검사는 아니며 이 수동 건수는 정규 audit에 합산하지 않습니다.

## 최종 감사

Debug·ReleaseSafe·ReleaseFast 전체 audit는 모두 종료 코드 0, 20/20 단계, 네이티브 666/666, WASM checks=6,958,939로 통과했습니다. 이전 6,956,927에 신규 2,012회 호출이 추가됐습니다. 로그는 `/tmp/hwpjs-extended-ordinate-{Debug,ReleaseSafe,ReleaseFast}.log`입니다. ReleaseSafe·ReleaseFast 산출물의 신규 직접 대조도 같은 수치로 통과하고 동률을 lt로 변경한 변형을 검출했습니다.

변경 Zig 포맷·JS 문법·diff 공백·문서 로컬 링크 5개를 확인했습니다. 최종 재검토에서는 목표 검증 우선순위, 잘못된 값·실수 정의역 오류 전파, offset 적용 폭, 최소 signed 값의 절댓값, 음의 지수·밑 부호, 정확 등식 검사 선행, 미확정 유지, 기존 parser 계약·출력 초기화를 확인했습니다. 이번 범위에서 추가 결함은 발견하지 않았습니다. 고정밀 거리 비교·최근접 출력 선택·전체 ICC 역변환·전체 HWP/HWPX 문서 검증은 미완료입니다.
