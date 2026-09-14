# EMF 32비트 poly drawing records

## 범위와 명세

`poly_records.zig`는 Microsoft [EMR_POLYBEZIER](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/4e53793a-95af-49d4-ae1f-4c407eda9440), [EMR_POLYGON](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/eb916781-58b6-4e92-b606-68071aa65733), [EMR_POLYLINE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/9ce6c9bb-1a13-48a5-9aa2-d95b334b5358), [EMR_POLYBEZIERTO](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/28431e45-a874-41dc-864d-8f4f69e8e831), [EMR_POLYLINETO](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/a2d8b738-8351-4a9c-9f3a-a6a8481c4c6f), [EMR_POLYPOLYGON](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/c60ff127-2711-42d3-85d4-502ca2e4caef) 및 같은 배치의 POLYPOLYLINE을 구분한다.

단일 도형은 Type/Size 8바이트, RectL 16바이트, Count 4바이트와 `Count * 8` PointL 배열의 정확한 크기를 요구한다. POLYBEZIER는 한 개 이상의 곡선을 나타내므로 Count가 4 이상이면서 `3n+1`, POLYBEZIERTO는 3 이상이면서 `3n`이어야 한다. 일반 polygon/polyline 계열에는 명세가 별도의 wire-level 최소 Count를 MUST로 두지 않으므로 0·1점도 원문 구조로 보존한다. 재생 시 선이나 면을 만들 수 있는지는 별도 의미 계층의 책임이다.

다중 도형은 32바이트 고정부 뒤 NumberOfPolygons개의 u32 count와 Count개의 PointL이 정확히 이어져야 한다. 각 하위 count의 u64 합은 전체 Count와 같아야 한다. 0개 도형·0점 하위 도형은 명시적인 금지 규칙이 없어 구조적으로 보존한다. Count를 남은 바이트에 맞춰 줄이거나 누락점을 0으로 채우지 않는다.

명세의 16K/1,360 최대점 표는 현재 pen 폭과 playback device의 wide-line 지원에 따라 달라진다. 메모리 구조 parser는 장치 상태를 갖지 않으므로 이를 고정 입력 상한으로 사용하지 않으며, 큰 count는 checked record extent로 제한한다.

## SSOT와 API 경계

| 책임 | 소유자 |
|---|---|
| signed PointL·RectL wire 순서 | `geometry.zig` |
| borrowed PointL 배열과 index 경계 | `point_l_array.zig` |
| record 종류·Count 산식·PolyPoly count 합계 | `poly_records.zig` |
| 전체 stream 연결 | `framing.zig` |

`Points.get`, `Multiple.countAt`, `Multiple.pointRange`는 원본 배열을 빌린 채 범위를 검사한다. PointL을 native struct로 cast하지 않고 공통 geometry parser를 호출한다. `pointRange`는 각 도형의 반열린 점 범위를 반환하며 원문을 재배열하지 않는다. Bounds가 실제 점을 포함하는지, 현재 위치 갱신, pen/brush/fill mode, Bezier 계산 및 출력은 이 구조 검사의 완료 범위가 아니다.

## 회귀 범위

- 다섯 단일 record 종류의 signed Bounds/PointL, 각 Bezier 유효·무효 나머지, 일반 도형의 0·1점 보존을 검사한다.
- 고정부의 모든 truncation, count 대비 1바이트 부족·초과, 선언 Size 불일치와 u32 최대 count의 checked extent를 거부한다.
- POLYPOLYLINE/POLYPOLYGON의 하위 count, 합계 불일치, 모든 잘림, 도형/점 index와 반열린 범위를 검사한다.
- 합성 전체 EMF에 POLYLINE을 삽입하여 `framing.validate`가 payload 오류를 전파하는지 검사한다.

적대적 검증은 (1) 단일 record의 count-derived 정확 extent 제거, (2) POLYBEZIER의 `3n+1` 나머지 검사 제거, (3) PolyPoly 하위 count 합계 검사 제거, (4) Count endian 반전, (5) framing 연결 제거의 다섯 변이를 임시 복사본에 각각 주입했다. Debug·ReleaseSafe·ReleaseFast의 15회 실행이 모두 정확 크기·Bezier 문법·합계·wire byte order·전체 stream 회귀로 변이를 탐지했다. 변이는 제품 작업 트리에 적용하지 않았다.

최초 구현 검토에서는 polygon/polyline 및 PolyPoly 하위 도형에 2점 이상을 강제했으나, 공식 record 문서가 이를 wire-level `MUST`로 규정하지 않는다는 반례를 확인했다. 해당 과잉 거부를 제거하고 0·1점 및 빈 PolyPoly를 보존하는 회귀를 추가한 뒤 전체 검증을 처음부터 다시 수행했다. 최종 원복 상태의 Debug·ReleaseSafe·ReleaseFast audit는 각 40/40 단계와 전체 1,326/1,326 테스트(네이티브 1,287개), HWP 검사 8,905,827건을 통과했다.

16비트 PointS 변형과 POLYDRAW/16의 point-type 배열은 동일 레코드가 아니며 아직 이 parser가 claim하지 않는다. 실제 HWP corpus 584개에는 EMF가 없어 실제 한글 생성기 표본 근거는 없고, 현재 증거는 공식 wire 명세와 합성 framing에 한정한다.
