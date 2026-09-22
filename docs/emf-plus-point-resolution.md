# EMF+ drawing PointData 절대 좌표 해석

## 범위와 단일 출처

`src/image/emf/emf_plus_resolved_point_data.zig`는 drawing record의 공용 `PointData`를 재생 가능한 절대 좌표 순서로 해석합니다. wire 형식·가변 Integer7/15·padding·개수 검증은 `emf_plus_point_data.zig`와 `emf_plus_point.zig`가 계속 소유하며 resolver는 검증된 borrowed iterator를 한 번만 감쌉니다. 입력을 복사하거나 할당하지 않습니다.

[MS-EMFPLUS EmfPlusDrawLines](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/a5c0bc88-ab0e-4126-b68f-47b04bfc5cad)는 P가 set된 첫 PointR의 이전 위치를 `(0,0)`으로, 이후 원소의 기준을 직전 원소가 지정한 위치로 정의합니다. resolver는 이 순서대로 X/Y delta를 각각 누적합니다. 최대 16 Mi 기본 point 한도에서도 i16 결과로 다시 좁히지 않도록 상대 결과와 절대 Point를 i64 정수 좌표로 노출합니다. PointF는 NaN·무한대·signed zero를 포함한 f32 원비트를 그대로 유지합니다.

`Iterator.next`는 borrowed source iterator와 이전 상대 위치를 임시 복사본에서 진행하고 성공한 뒤에만 교체합니다. 호출자가 원본 수명을 위반해 bytes를 잘라 오류가 발생해도 offset·remaining·누적 위치가 함께 유지됩니다. `toPointF()`는 소비 계층의 공용 f32 경계로, PointF 원비트를 그대로 반환하고 i64 정수에는 `@floatFromInt`를 한 번 적용합니다.

## 지원 경계

이 계층은 FillPolygon, FillClosedCurve, DrawBeziers, DrawClosedCurve, DrawImagePoints, DrawLines처럼 공용 `PointData`를 반환하는 record가 공유합니다. `fromIterator`는 별도 point type 배열을 가진 `EmfPlusPath`가 같은 누적 상태를 재사용하는 진입점이며, Path command 문법은 [Path geometry 계층](emf-plus-path-geometry.md)이 소유합니다. 각 소비자가 상대좌표 누적을 다시 구현하지 않습니다.

절대 좌표 해석 자체는 clip, 곡선 평가, fill/stroke rasterization이나 저장을 구현했다는 뜻이 아닙니다. DrawLines와 FillPolygon의 인접·닫힘 선분은 [polyline geometry 계층](emf-plus-polyline-geometry.md)이 조립하고 [device segment 계층](emf-plus-polyline-device-segments.md)이 공용 좌표 변환을 적용합니다. DrawBeziers의 점 역할과 endpoint 공유는 [Bézier geometry 계층](emf-plus-bezier-geometry.md)이 조립하고 [Bézier device segment 계층](emf-plus-bezier-device-segments.md)이 같은 좌표 변환을 적용합니다. 세 cardinal curve record의 열린 범위·닫힘 연결은 [cardinal span 계층](emf-plus-cardinal-spans.md)이, Path의 figure와 point type은 [Path geometry 계층](emf-plus-path-geometry.md)이, DrawImagePoints의 destination은 [image parallelogram 계층](emf-plus-image-parallelogram.md)이 소비합니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 0개이므로 합성 결과를 실제 한컴 출력 동등성으로 주장하지 않습니다.

## 검증 기록

합성 fixture는 첫 원점 기준, 혼합 Integer7/15 폭, 양·음 delta의 연속 누적과 i16 범위 초과, 절대 i16의 i64 보존, PointF signed zero·NaN 원비트, 종료와 잘림 오류 원자성을 검사합니다.

원점 초기값, X에 Y delta 사용, Y 비누적, 절대 정수 X/Y 교환, PointF X/Y 교환의 5개 의미 변이를 독립 source와 모드별 새 cache에서 Debug·ReleaseSafe·ReleaseFast로 실행했습니다. 유효 15/15회가 assertion 의미 실패로 검출됐고 생존·컴파일 오류·panic·timeout은 0입니다. 최초 정수·PointF 변이 6회는 복사본 준비가 끝난 뒤 source가 원본으로 덮여 실제 diff가 없었으므로 결과에서 제외하고, diff를 재확인한 v2 로그만 사용했습니다. 로그는 `/tmp/hwpjs-point-resolution-mutants.6OlNnC/{origin,x_from_y,y_non_cumulative}-{Debug,ReleaseSafe,ReleaseFast}.log`와 `{integer_swap,float_swap}-v2-{Debug,ReleaseSafe,ReleaseFast}.log`입니다.

변경 소스를 고정한 뒤 세 모드 전체 `audit`를 순차 실행했습니다. 각 모드는 40/40 단계와 1,920/1,920 테스트(native 1,881, chart 31, WMF 8), HWP/WASM 8,905,827 checks, imports 0을 통과했고 CFB 12,000 변이의 traps는 0입니다. 로그는 `/tmp/hwpjs-point-resolution-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
