# ICC 행렬/TRC 모델 조립

후속 [행렬/TRC 순방향 점 계산](icc-matrix-trc-forward.md)은 조립된 모델과 기존 곡선 점 계산기를 연결하고 세 모드 전체 감사를 통과했습니다.

현재 조립 계층은 구현 후 세 모드 전체 감사를 통과했습니다. 전체 프로파일·변환 우선순위·점 계산 통합은 아래 보류 범위와 구분합니다.

## 명세와 현재 범위

[ICC.1:2022 §8.3.3·§8.4.3·Annex F.3](https://www.color.org/specifications/ICC.1-2022-05.pdf)의 세 XYZ 열 태그와 세 TRC를 하나의 모델로 연결합니다. 명세는 이 모델을 RGB 이름만으로 제한하지 않고 조건에 맞는 3성분 색공간과 PCSXYZ를 요구합니다. `matrix_trc_model.assemble`은 파싱된 불변 tag_table.Table의 실제 헤더로 기존 required_plan.build를 호출하여 클래스·성분 수·PCS 조건을 재사용합니다. 현재 v4_2022만 명시적으로 지원하며 헤더 major가 4인지 함께 확인합니다.

XYZ 태그는 행이 아니라 열입니다. rXYZ/gXYZ/bXYZ의 각 XYZ를 행 우선 coefficients에 전치 배치하며, rTRC/gTRC/bTRC의 실제 payload는 기존 xyz_tag/trc_tag 파서로 해석합니다. 태그 순서는 결과를 바꾸지 않고, 6개 중 하나라도 없으면 MissingIccMatrixModelTag입니다. 반환 계수는 값으로 소유하지만 TRC 샘플은 원본 프로파일 바이트를 빌리므로 원본 수명을 유지해야 합니다.

이 API는 호출자가 행렬/TRC 모델을 명시적으로 선택한 경우의 조립기입니다. 공통 desc/cprt/wtpt/chad의 존재·payload 검증, 헤더 의미 검증, LUT 우선순위, 전체 곡선 유효성·역함수, 프로파일 변환 성공을 보증하지 않습니다. profile_semantics_deferred와 transform_priority_deferred는 true입니다. required_plan이 만든 공통 필수 태그 집합을 모두 검증했다고 주장하지 않습니다. 순방향 조립 자체에 명세상 근거 없이 비특이 조건을 추가하지 않으며 역행렬이 필요한 계산 단계가 특이성을 처리합니다.

## 검증 진행

네이티브 테스트는 실제 바이트에서 tag_table.parse를 거쳐 조립합니다. 비대칭 열의 행/열 순서, descriptor 순서 교환, 각 필수 모델 태그의 독립 누락과 identity TRC를 검사합니다. 헤더 조건 테스트는 분리된 헤더 값에 3CLR 허용, CMYK/PCSLAB/출력 클래스 거부와 미지원 판본을 대조합니다. WASM 독립 비교·실프로파일 연결·세 모드 전체 감사는 아직 남아 있습니다.

최초 네이티브 실행은 471개 통과·1개 crash로 실패했습니다. 순서 교환 fixture에서 첫 원소를 자신과 교환할 때 @memcpy 인수가 alias하는 테스트 코드 오류였습니다. 두 descriptor를 먼저 값으로 복사한 뒤 쓰도록 수정했습니다. 이 실패 실행을 제품 파서 통과 결과로 치환하지 않습니다.

수정 후 `zig build test --summary all`은 종료 코드 0, 5/5 단계·472/472 테스트로 통과했습니다. 포맷·diff 공백 검사도 통과했습니다. 이번 조립 계층의 WASM·세 모드 전체 감사는 아직 완료 전입니다.

WASM mode175는 실제 프로파일을 tag_table.parse로 읽고 조립된 행 우선 계수, 보류 플래그, 세 곡선의 종류·개수·전체 샘플/파라미터 값을 반환합니다. 길이 계산은 checked 산술을 사용하며 descriptor 배열을 모든 종료 경로에서 해제합니다. JS 기대값은 원본 태그 payload에서 직접 읽고 채널 이름으로 배치합니다.

Debug WASM 직접 실행에서 비교 742건·오류 거부 330건이 통과했습니다. 여섯 태그의 전체 순열 720개, 각 채널의 다섯 parametric 함수, 3성분 헤더 조합, 개별 모델 태그 누락·타입 손상, 모든 잘림 길이·한도·판본 거부·실패 후 복구를 포함합니다. identity/gamma/샘플 곡선을 채널마다 다르게 두어 잘못된 채널 연결을 감추지 않습니다.

읽기 전용 실파일 대조에서는 /System/Library/ColorSync/Profiles의 ACESCG Linear, DCI(P3) RGB, Display P3, ITU-2020, ITU-709, ROMM RGB 프로파일 6개가 독립 기대값과 일치했습니다. 계수뿐 아니라 세 곡선의 모든 값과 순서도 비교했습니다. 파일은 저장소에 복사하지 않았으며 이 6건은 정규 감사 수에 더하지 않습니다. 전체 색상 변환이나 다른 판본 지원을 입증하는 검사가 아닙니다. Debug 전체 감사는 실행 중입니다.

추가 수동 적대적 검사 22건에서 A2B0·desc·미지 태그를 각각 7개 위치와 혼합 위치에 삽입했습니다. 공통 8바이트 접두사만 있는 미해석 payload를 사용하여 모델 태그가 아닌 내용까지 유효 판정하는지 구분했습니다. 계수·곡선 출력은 같고 profile_semantics_deferred·transform_priority_deferred는 계속 true였습니다. 이 입력이 전체 프로파일로 유효하다는 뜻이 아니며, 후속 전체 검증기에서는 각 태그의 실제 payload 검사와 우선순위 처리가 필요합니다. 수동 검사 수는 정규 감사에 더하지 않습니다.

Debug 전체 감사는 `/tmp/hwpjs-icc-model-Debug-final.log`에서 종료 코드 0, 20/20 단계·472/472 네이티브 테스트·WASM 5,125,553개 검사로 통과했습니다. 이번 주제 비교 742건·거부 330건을 확인했습니다. ReleaseSafe·ReleaseFast 전체 감사는 아직 완료 전입니다.

ReleaseSafe 전체 감사도 `/tmp/hwpjs-icc-model-ReleaseSafe-final.log`에서 종료 코드 0, 20/20 단계·472/472 네이티브 테스트·WASM 5,125,553개 검사로 통과했습니다. 이번 주제 비교 742건·거부 330건이 일치했습니다. ReleaseFast 감사는 진행 중입니다.

ReleaseFast 전체 감사는 `/tmp/hwpjs-icc-model-ReleaseFast-final.log`에서 종료 코드 0, 20/20 단계·472/472 네이티브 테스트·WASM 5,125,553개 검사로 통과했습니다. 이번 주제 비교 742건·거부 330건이 일치하여 세 모드 검증을 마쳤습니다. 위의 진행 중 표현은 각 실행 당시 기록입니다.

최종 적대적 리뷰에서 실제 헤더에서 모델 조건 구성, 채널 순서, 단일 태그 파서 재사용, 누락/중복 방어, 샘플의 borrowed 수명, probe의 checked 출력 길이와 해제 경로를 확인했습니다. 테스트 fixture의 alias 오류 수정 이후 이번 범위의 추가 결함은 발견하지 못했습니다. 포맷·변경 JS 구문·diff 공백과 관련 문서 로컬 링크 10개 검사도 통과했습니다. 전체 ICC·PNG·HWP/HWPX 검증의 완료를 뜻하지 않습니다.
