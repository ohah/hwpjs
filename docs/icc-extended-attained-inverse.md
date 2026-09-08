# ICC 확장 목표의 도달 역함수 선택

## 명세와 계약

[ICC.1:2022 Annex F.1(a), PDF 115쪽](https://www.color.org/specifications/ICC.1-2022-05.pdf#page=115)을 재확인했습니다. 비상수 단조 곡선의 평탄 역상이 정의역 끝을 포함하면 가장 작은 x를, 그렇지 않으면 가장 큰 x를 선택합니다. 감소 곡선도 x 기준을 그대로 사용합니다.

`parametric_attained_inverse.selectWide(precision, curve, n, d)`는 u512 목표를 검증한 뒤 전체 곡선의 정의역·비상수 단조성을 검사하고 [확장 경계](icc-extended-preimage-bounds.md)를 이용해 선택합니다. 결과는 selected·missing_preimage·undecided이며 selected의 좌표는 u1024 유리수 또는 기호근과 affine 계수입니다. 미확정은 해 없음이 아니며, 해 없음은 최근접 출력 부재의 증명이 아닙니다. 필요한 극값이 도달되지 않으면 기존 UnattainedIccPreimageMaximum/Minimum 오류를 유지합니다.

이 API는 도달 목표에 대한 F.1(a)이며 F.1(b)의 최근접 출력 검색을 포함하지 않습니다. 전체 고정밀 역변환·제품 JS API·HWP 이미지 통합 완료를 의미하지 않습니다.

## SSOT

기존 [도달 목표 selector](icc-parametric-attained-inverse.md)와 selectFor가 목표 검증·전체 단조성 gate·경계 호출·선택 순서를 공유합니다. Types는 기존 경계 타입에서 좌표를 가져오며 별도 좌표 표현을 정의하지 않습니다. 끝점과 x=1의 비교는 폭별 기존 근 비교기로 수행하고 미확정을 유지합니다. attained=false인 상한은 정의역 끝 예외를 활성화하지 않습니다.

실제 선택 정책은 기존 `preimage_choice_rule.zig`, 전체 곡선 검증은 `parametric_inverse_gate.zig`, 역상은 기존 solver가 소유합니다. 새 API는 연결만 하며 파일 접근·할당·실수 근사를 하지 않습니다.

## 테스트 계약과 진행

mode231은 precision+n/d u512의 132바이트 BE prefix 뒤 para 태그를 받습니다. missing_preimage=0·undecided=1은 4바이트이고 selected=2는 status와 284바이트 경계 wire를 합친 288바이트입니다. 선택 좌표의 attained는 true입니다. 기존 mode202와 폭별 probe를 공유하며 경계 serializer도 재사용합니다.

JS 독립 선형 critical-cell 기준과 선택 기준을 사용합니다. 증가/감소·평탄·열린 끝·빈 틈·상수·비단조·정의역 오류·최대 u512 분모 주변·전체 폭 선형 좌표·축약하지 않은 거듭제곱 목표·오류 후 복구를 포함합니다. 기존 직접 결과는 selected=422/missing=88/rejected=902/undecided=1, 확장은 439/88/998/1입니다.

항상 하한 선택, 항상 상한 선택, undecided를 missing_preimage로 변경, 비단조 오류 대신 알려진 해 반환, 큰 좌표 잘림의 다섯 출력 변형을 ERR_ASSERTION으로 검출했습니다. 임시 소스 복사본의 gate에서 비단조 곡선을 허용하자 Debug·ReleaseSafe·ReleaseFast 모두 확장 네이티브 5개 중 1개가 실패했습니다. 로그는 `/tmp/hwpjs-extended-attained-mutant-{Debug,ReleaseSafe,ReleaseFast}.log`입니다. 제품에는 변형을 남기지 않았습니다. 실제 전체 네이티브는 662/662로 통과했습니다.

## 실제 ICC와 독립 단조성 확인

시스템 para TRC 15개의 type0/type3와 양의 g/a, a+b=65536을 확인했습니다. type3은 내부 분기점과 양의 하위 기울기, 양 분기의 접점 출력이 (0,1]에 있음을 검사했습니다. D=65536², N=a*d+b*65536, L=c*d, 기약 g/65536=p/q에 대해 독립 BigInt로 N^p*D^q와 D^p*L^q를 비교하여 점프 방향을 판정했습니다. 각 분기가 증가하므로 하향 점프는 전체 비단조의 증거입니다.

u512 최대 분모로 표현한 목표 0/1에서 비상수 단조 18건은 정확한 0/1 좌표를 선택했고 하향 점프 12건은 NonMonotonicIccCurve로 거부했습니다. 해당 목표의 해가 존재한다는 사실만으로 전체 곡선 검증을 생략하지 않습니다. 이 수동 30건은 정규 audit 호출 수에 합산하지 않으며 실제 HWP 렌더링이나 운영체제 색상 엔진과의 동작 일치를 주장하지 않습니다.

## 최종 감사

Debug·ReleaseSafe·ReleaseFast 전체 audit는 모두 종료 코드 0, 20/20 단계, 네이티브 662/662, WASM checks=6,956,927로 통과했습니다. 이전 6,955,401에 확장 selector의 1,526회 호출이 추가됐습니다. 로그는 `/tmp/hwpjs-extended-attained-{Debug,ReleaseSafe,ReleaseFast}.log`입니다. ReleaseSafe·ReleaseFast 산출물 직접 실행도 같은 신규 수치로 통과하고 항상 상한 선택 변형을 검출했습니다.

변경 Zig 포맷·JS 문법·diff 공백·로컬 문서 링크 7개를 확인했습니다. 최종 재검토에서 목표 검증 우선순위, 전체 곡선 gate 유지, 끝점 예외와 attained의 결합, 미확정 전파, 폭 보존, 기존 선택 규칙·경계 serializer 재사용, 출력 전체 초기화·할당 후 오류 경로 부재를 확인했습니다. 이번 범위에서 추가 결함은 발견하지 않았습니다. 고정밀 최근접 출력 검색·전체 ICC 역변환·전체 HWP/HWPX 문서 검증은 여전히 미완료입니다.
