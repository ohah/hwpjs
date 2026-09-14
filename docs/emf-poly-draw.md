# EMF POLYDRAW records

## 범위와 명세

`poly_draw.zig`는 Microsoft [EMR_POLYDRAW16](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/57f0cfe7-2139-4199-b6ad-61fb61a1d4ec) 및 같은 PointL 배치의 EMR_POLYDRAW를 구분한다. 두 record는 Type/Size, RectL, Count 뒤 Count개의 점과 정확히 Count바이트인 type 배열을 순서대로 가진다. `POLYDRAW`는 8바이트 PointL, `POLYDRAW16`은 4바이트 PointS를 사용한다.

내용 끝은 4바이트 record 경계로 올림하며 0~3바이트 padding은 의미를 부여하지 않고 빌려 보존한다. `28 + Count * (point_width + 1)`과 정렬을 u64에서 계산하고 실제/선언 Size가 정확히 일치한 뒤에만 usize offset으로 바꾼다. 입력 길이에 맞춰 Count를 줄이거나 type을 생성하지 않는다.

`point_type_array.zig`는 공식 [Point Enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/01b63e3f-19d6-437c-8fc6-2758884bc08d)의 유일한 소유자다. 기본 operation은 LINETO 2, BEZIERTO 4, MOVETO 6이고 close bit 1은 LINETO 또는 Bezier의 끝점에만 붙는다. 따라서 wire 값 2·3·4·5·6만 허용하고 MOVETO|CLOSE 7 및 다른 모든 u8을 거부한다. BEZIERTO는 연속 세 개이며 첫 두 control type은 정확히 4, 세 번째 endpoint만 4 또는 5다.

## SSOT와 소유권

| 책임 | 소유자 |
|---|---|
| PointL/PointS·RectL signed wire 해석 | `geometry.zig` |
| 좌표 폭별 borrowed 배열 | `point_l_array.zig`, `point_s_array.zig` |
| Point type 값·Bezier 세 점 문법 | `point_type_array.zig` |
| 병렬 배열 extent·padding·32/16 조립 | `poly_draw.zig` |
| 전체 stream 연결 | `framing.zig` |

points와 types는 같은 Count에서 파생되어 개수가 항상 같지만 별도 원문 slice를 빌린다. padding도 정규화하지 않는다. current position·figure 시작/닫힘 상태, active path 반영, 실제 line/Bezier 재생은 구조 parser에 넣지 않는다.

## 검증 범위

- 0..255 type 전 값을 독립적으로 순회해 다섯 wire 값만 수용하고 close bit를 보존한다.
- 정상 Bezier triple, 잘린/비연속 triple, 첫·둘째 control point의 잘못된 close를 구분한다.
- PointL/PointS 극값, 빈 배열, padding 0·1·2·3바이트와 무시 padding 원문을 검사한다.
- 고정부 모든 잘림, count-derived 길이보다 부족·초과, 선언 Size 불일치, u32 최대 Count를 거부한다.
- 합성 전체 EMF의 POLYDRAW16 record로 framing 연결 및 잘못된 type 전파를 검사한다.

최초 type parser는 base operation만 세 개 연속이면 첫·둘째 Bezier control point의 close도 허용했다. Microsoft PolyDraw 설명은 close가 Bezier endpoint type에 결합된다고 명시하므로 첫 두 바이트를 정확히 4로 제한하고 해당 반례를 회귀로 추가했다.

적대적 검증은 (1) MOVETO|CLOSE 값 7 허용, (2) Bezier triple 검사 무력화, (3) POLYDRAW16 좌표 폭을 8바이트로 변경, (4) count-derived 정확 extent 제거, (5) framing 연결 제거의 다섯 변이를 임시 복사본에 각각 주입했다. Debug·ReleaseSafe·ReleaseFast의 15회 실행이 모두 전수 값 영역·시퀀스·좌표 폭·정렬 extent·전체 stream 회귀로 변이를 탐지했다. 변이는 제품 작업 트리에 적용하지 않았다.

최종 원복 상태의 Debug·ReleaseSafe·ReleaseFast audit는 각 40/40 단계와 전체 1,343/1,343 테스트(네이티브 1,304개), HWP 검사 8,905,827건을 통과했다.

그림 상태 전이와 렌더링, POLYDRAW가 path 안팎에서 만드는 결과는 아직 미구현이다. 실제 HWP corpus 584개에는 EMF가 없어 실제 한글 생성기 표본과 비교했다는 뜻도 아니다.
