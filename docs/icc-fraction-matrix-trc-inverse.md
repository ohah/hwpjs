# 분수 XYZ의 Matrix/TRC 역변환 연결

## 계약과 책임

`matrix_trc_inverse.evaluateFraction(precision,model,xyz)`는 i256 분자 3개/u256 공통 분모의 실제 XYZ 좌표를 받습니다. PCSXYZ wire 인코딩이 아닙니다. 기존 `evaluateFixed`의 signed 16.16 입력 계약은 유지합니다.

[분수 역행렬](icc-fraction-matrix-inverse.md) 결과인 i512/u512 선형 RGB를 원형 그대로 보고서에 보존합니다. 그 뒤 [범위 제한](icc-wide-linear-target.md)을 적용하고 [확장 TRC 역변환](icc-extended-trc-inverse.md)에 전달합니다. XYZ를 역행렬 계산 전에 자르거나 중간 분수를 u128로 줄이지 않습니다.

두 진입점은 `finish`의 채널별 조립 순서를 공유합니다. 행렬 수학·범위 제한·TRC 수학은 각각 기존 모듈이 소유합니다. `matrix_trc_inverse_types.Of`가 폭별 결과 타입을 조립하며 profile_semantics_deferred와 transform_priority_deferred는 계속 true입니다. LUT 우선순위나 프로파일 전체 의미 검증 완료를 뜻하지 않습니다.

채널별 selected/ambiguous/unattained/undecided를 보존하며 앞 채널이 미확정이어도 뒤 채널을 검사합니다. 뒤 채널의 잘못된 곡선은 전체 호출의 오류로 전파합니다. 분모 0·특이행렬은 TRC 전에 거부합니다. 파일 접근·할당·실수 근사는 추가하지 않습니다.

## 검증 진행 중

신규 네이티브 3개는 큰 XYZ 분수와 u256보다 큰 중간 분모, 비대칭 혼합 후 clipping, 음수 행렬식, 샘플 endpoint plateau·감마·identity 채널 분리, 동률·출력 부재와 뒤 채널 오류, 입력 오류 우선순위를 검사합니다. union/optional 태그를 먼저 assert합니다.

첫 Debug 전체 네이티브 실행은 5/5 단계, 688/688 테스트로 통과했습니다.

이 변경의 완료된 검증 결과는 아래에 기록합니다. 실제 렌더링·HWP/HWPX 전체 문서 검증 완료를 의미하지 않습니다.

## WASM 직접 대조

mode238은 precision과 i256 XYZ 분자 3개/u256 분모의 132바이트 BE prefix 뒤 ICC 프로파일을 받아 실제 태그 테이블·모델 조립을 거칩니다. 기존 mode215와 probe를 공유합니다. 출력은 보류 플래그 8바이트, i512 분자 3개/u512 분모 256바이트, clipping 12바이트, 채널 payload 길이 12바이트 뒤 기존 확장 TRC wire 3개입니다. 모든 채널 임시 버퍼는 실패 경로에서도 해제합니다.

Debug 직접 실행은 기존 고정소수점 3,331 비교/1,099 거부, 분수 경로 3,335 비교/1,217 거부로 통과했습니다. 기대 행렬은 제품의 여인수 대신 독립 유리수 가우스 소거법으로 계산합니다. 큰 signed XYZ/분모, 계수 상쇄, 네 정밀도·64가지 채널 조합, 무작위 전체 폭 입력, 증가·감소 샘플 plateau, 정확한 제곱근, 복합 상태의 payload, 후속 채널 오류, 잘림·한도·오류 후 재사용을 검사합니다.

세 모드 전체 감사 결과는 아래 최종 감사 기록을 참조합니다.

## 적대적 검사·실제 프로파일

Debug WASM 출력에서 첫 두 선형 채널 교환, 첫 선형 좌표 상위 비트 삭제, clipping을 none으로 변경, ambiguous를 unattained로 변경, 첫 payload 길이를 1 증가시키는 다섯 변형은 모두 ERR_ASSERTION으로 검출했습니다. 이는 출력 검사 민감도이며 모든 구현 오류 검출을 뜻하지 않습니다.

임시 소스 `/tmp/hwpjs-fraction-model-mutant.Jf4Hy0/icc`에서 모든 채널이 `model.curves[0]`을 사용하도록 바꿨습니다. 세 모드 모두 신규 3개 중 2개가 실패했습니다. 채널 분리 검사는 TestUnexpectedResult로, 복합 상태 검사는 잘못 연결된 곡선의 UnattainedIccPreimageMaximum 전파로 실패했습니다. 제품 소스는 변경하지 않았습니다. 모드별 결과는 `/tmp/hwpjs-fraction-model-mutant-{Debug,ReleaseSafe,ReleaseFast}.log`에 기록했습니다.

실제 macOS ACESCG Linear와 DCI(P3) RGB의 원시 프로파일을 mode238에 전달했습니다. 독립적으로 XYZ 태그의 행렬 및 curv 단일 양의 감마/para type0 양의 지수를 확인하고, RGB 끝점 세 조합에서 XYZ를 계산한 뒤 역변환 결과를 검사했습니다. 두 프로파일 합계 6건이 정확한 끝점과 일치했습니다. 프로파일 파일은 읽기 전용이며 수동 검사는 정규 audit에 합산하지 않습니다. 중간 색상·OS 렌더링 대조는 아닙니다.

추가 Debug 수동 왕복은 행렬 3종(identity·부호 혼합·큰 계수 상쇄)과 identity/엄격 증가 샘플의 채널 조합 8종으로 24건을 검사했습니다. 입력은 1/3, 2/5, 4/7입니다. mode176 순방향을 독립 계산으로 먼저 대조한 뒤 원시 i256/u256 결과를 그대로 mode238에 전달했습니다. 선형 결과는 독립 샘플 순방향 값과, 장치 좌표는 원래 입력 분수와 정확히 일치했습니다. 샘플 plateau의 역상 비유일성이나 비유리수 감마 왕복을 검증한 것은 아닙니다. 수동 건수는 정규 audit에 합산하지 않습니다.

## 최종 감사

Debug·ReleaseSafe·ReleaseFast 전체 audit는 모두 종료 코드 0, 20/20 단계, 네이티브 688/688, WASM checks=6,992,456으로 통과했습니다. 이전 6,987,904에 신규 4,552건이 추가됐습니다. 로그는 `/tmp/hwpjs-fraction-model-{Debug,ReleaseSafe,ReleaseFast}.log`입니다. ReleaseSafe·ReleaseFast 실제 감사 산출물에서도 기존/분수 직접 대조와 출력 변형 5종 검출이 통과했습니다.

최종 검토에서는 역행렬 후 clipping 순서, 선형 원값 보존, 분수 narrowing 부재, 채널별 TRC 호출과 오류 전파, 의미 보류 플래그 유지, 폭별 타입의 공통 소유, 기존 wire 유지, 임시 버퍼 실패 경로 해제와 전체 출력 초기화를 확인했습니다. 이번 범위에서 추가 결함은 발견하지 못했습니다. Zig 포맷·JS 문법·diff 공백·문서 로컬 링크 6개도 확인했습니다. 전체 ICC 프로파일 의미 검증, PNG iCCP 연결, 실제 렌더링과 전체 문서 검증은 별도 미완료입니다.
