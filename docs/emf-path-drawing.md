# EMF path 그리기 records

## 기준과 범위

Microsoft [EMR_FILLPATH](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/7cc0afcb-0693-4810-a3cb-b69c871ce473), [EMR_STROKEANDFILLPATH](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/2794792a-38b4-4d19-adec-28fc2a6273b2), [EMR_STROKEPATH](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/c8b86df6-7464-45b0-bca4-6ffab9174961) record를 기준으로 한다. 세 record의 공통 의미 prefix는 Type, Size, 16바이트 Bounds로 구성된 24바이트다.

## 책임

- `path_drawing.zig`는 세 Type을 서로 다른 union tag로 보존하고 공통 `geometry.RectL`로 signed Bounds를 해석한다.
- `record_extent.requiredEnd`가 선언 Size와 실제 slice의 일치 및 24바이트 필수 prefix를 검사한다.
- 의미 prefix 뒤의 호환성 data는 해석하지 않고 `trailing_data`로 빌려 보존한다.
- `framing.zig`는 parser를 전체 record 순회에 연결하고 인식한 수를 `path_drawing_records`에 보존한다.

닫힌 current path의 존재, FILL/STROKE 후 path 폐기, 현재 pen·brush·polygon fill mode, Bounds 재계산과 실제 렌더링은 playback 계층의 책임이며 이번 wire parser 지원 범위에 포함하지 않는다. 구조 파싱 성공을 화면 출력 지원으로 확대하지 않는다.

## 검증 기록

서로 다른 signed Bounds, 세 operation tag, 후행 data 보존, 모든 0~23바이트 prefix 절단, 선언/실제 크기 불일치, 무관 Type 비수용과 framing 연결을 검사한다.

세 Type 각각의 분류 제거, Bounds left/top 교환, 필수 크기 약화, 후행 data 손실, framing 집계 제거의 7개 독립 변이를 적용했다. Debug·ReleaseSafe·ReleaseFast의 `21/21` 변이 실행이 모두 실패하여 해당 회귀를 탐지했다.

최종 전체 audit는 Debug·ReleaseSafe·ReleaseFast에서 각각 `40/40` 단계와 `1377/1377` 테스트를 통과했다.
