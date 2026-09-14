# EMF 16비트 poly drawing records

## 범위와 공통 규칙

`poly_records_16.zig`는 Microsoft [EMR_POLYBEZIER16](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/3329ee26-17ed-4371-8f51-e3985d764d77), [EMR_POLYLINE16](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/ca3a6590-c023-4354-8d6d-e3d40d7eb5b9), [EMR_POLYLINETO16](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/0d5a4710-25f9-43be-bb08-3e38a4db1249), [EMR_POLYPOLYGON16](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/96ad447f-25d6-4272-8d18-51b395e669c6) 및 같은 배치의 POLYGON16·POLYBEZIERTO16·POLYPOLYLINE16을 구분한다.

이 파트는 32비트 파서의 record 종류나 Count 규칙을 복사하지 않는다. `poly_rules.zig`가 14개 종류를 논리 도형과 long/short 좌표로 한 번만 매핑하고 Bezier `3n+1`/`3n` 및 PolyPoly count 합계를 소유한다. `poly_layout.zig`가 공통 28/32바이트 header, 좌표 폭을 적용한 u64 extent와 원문 배열 분할을 수행한다. `poly_groups.zig`가 두 좌표 폭에서 동일한 하위 count와 반열린 point range 접근을 제공한다.

16비트 전용 책임은 `geometry.parsePointS`의 signed i16 little-endian XY 해석, `point_s_array.zig`의 4바이트 borrowed 배열과 `poly_records_16.zig`의 typed 결과 조립뿐이다. Bounds는 16비트 변형에서도 RectL이므로 기존 signed i32 parser를 그대로 사용한다. PointS를 WMF record의 YX 배치와 혼동하지 않는다.

일반 polygon/polyline의 0·1점과 빈 PolyPoly를 구조적으로 보존하고, 장치·pen에 따른 최대점과 drawing 의미는 재생 계층에 남기는 정책도 32비트 계약과 같다. 32비트 parser는 short 종류를, 16비트 parser는 long 종류와 POLYDRAW16을 claim하지 않는다.

## 검증 범위

- 다섯 단일 종류와 두 다중 종류의 signed PointS 극값, RectL, 정확한 4바이트 좌표 폭을 확인한다.
- 모든 고정부 잘림, PointS 1바이트 부족, 온전한 PointS 하나 초과, 선언 Size 불일치, u32 최대 count를 검사한다.
- 공통 Bezier 산식, 하위 count 합계, 도형/점 index와 반열린 범위, 일반 퇴화 배열을 16비트 경로에서도 독립 회귀로 고정한다.
- 합성 전체 EMF에 POLYLINE16을 삽입해 framing 연결과 payload 오류 전파를 확인한다.

적대적 검증은 (1) PointS 폭을 4에서 8로 변경, (2) PointS x의 endian 반전, (3) POLYPOLYGON16을 long 좌표 종류로 오분류, (4) 공통 PolyPoly count 합계 검사 제거, (5) framing의 16비트 parser 연결 제거의 다섯 변이를 임시 복사본에 각각 주입했다. Debug·ReleaseSafe·ReleaseFast의 15회 실행이 모두 좌표 폭·signed wire 해석·14종 공통 분류·합계·전체 stream 회귀로 변이를 탐지했다. 변이는 제품 작업 트리에 적용하지 않았다.

첫 구현은 32/16 파일에 구조 조립과 하위 범위 접근을 복제했다. SSOT 재검토에서 이를 발견해 종류/산식은 `poly_rules.zig`, extent/배열 분할은 `poly_layout.zig`, 그룹 접근은 `poly_groups.zig`로 이동한 뒤 양쪽 회귀와 전체 검증을 다시 실행했다. 최종 상태의 Debug·ReleaseSafe·ReleaseFast audit는 각 40/40 단계와 전체 1,336/1,336 테스트(네이티브 1,297개), HWP 검사 8,905,827건을 통과했다.

POLYDRAW16의 병렬 point-type 배열, current-position 및 path 상태 전이, 실제 곡선/선/채움 재생은 미구현이다. 실제 HWP corpus 584개에는 EMF가 없으므로 실제 한글 생성기 호환성 근거로 확대하지 않는다.
