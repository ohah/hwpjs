# EMF+ polyline·polygon 선분 조립

## 범위와 단일 출처

`src/image/emf/emf_plus_polyline_segments.zig`는 공용 drawing `PointData`를 순서가 있는 선분 iterator로 조립합니다. wire 좌표와 상대 delta 누적은 각각 `emf_plus_point_data.zig`와 [절대 좌표 resolver](emf-plus-point-resolution.md)가 소유하며 이 계층은 인접한 절대점 `(p0,p1), (p1,p2), ...`만 연결합니다. 입력을 빌리고 할당하지 않으며 i64 정수 좌표와 PointF 원비트를 그대로 전달합니다.

[MS-EMFPLUS EmfPlusDrawLines](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/a5c0bc88-ab0e-4126-b68f-47b04bfc5cad)는 L이 set이면 마지막 점과 첫 점 사이에 추가 선을 그리도록 정의합니다. `DrawLines.segments()`는 record의 L 값을 그대로 닫힘 정책으로 전달합니다. [EmfPlusFillPolygon](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/813d7a7b-835d-4159-a8a8-bc3547a878e2)은 polygon 내부를 채우는 record이므로 `FillPolygon.segments()`는 항상 마지막 점에서 첫 점으로 닫힌 경계를 반환합니다.

마지막 점이 이미 첫 점과 같은 경우에도 명세에 없는 중복 제거를 하지 않고 명시적인 퇴화 closing segment를 보존합니다. 점이 0개 또는 1개인 일반 공용 입력은 선분이 없으며, 실제 DrawLines와 FillPolygon parser의 최소 Count 2·3 검사는 각 wire record가 계속 소유합니다.

## 원자성과 지원 경계

첫 `next`는 첫째와 둘째 점을 함께 읽어 첫 선분을 만듭니다. 둘째 점에서 borrowed source 오류가 나면 첫 점 소비, 상대좌표 누적, segment count와 종료 상태를 모두 커밋하지 않습니다. 정상 종료 뒤에는 source를 다시 읽지 않으며 closing segment도 한 번만 반환합니다.

이 계층은 선분 topology까지만 구현하며 [device segment 계층](emf-plus-polyline-device-segments.md)이 결과 endpoint에 일반 world/page/device 변환을 적용합니다. clipping, Pen stroke와 Brush fill 규칙, anti-aliasing·rasterization 및 저장은 후속 범위입니다. DrawBeziers와 cardinal spline은 단순 인접 선분으로 바꾸면 의미가 손실되므로 이 API에 연결하지 않습니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 0개라 실제 한컴 렌더링 동등성도 주장하지 않습니다.

## 검증 기록

합성 fixture는 PointR 절대좌표와 인접 순서, open/closed segment 수, 마지막→첫 점, i64 좌표, PointF signed zero·NaN 원비트, 이미 닫힌 입력의 퇴화 segment, singleton, 반복 종료와 첫 호출 잘림 원자성을 검사합니다. DrawLines의 L 양쪽과 FillPolygon의 강제 닫힘은 각 record parser 결과에서 통합 검사합니다.

선분 시작점, previous 갱신, open 강제 닫힘, 잘못된 closing endpoint, singleton 닫힘, closing 반복, DrawLines L 전달, FillPolygon 강제 닫힘의 8개 의미 변이를 독립 source와 모드별 새 cache에서 Debug·ReleaseSafe·ReleaseFast로 실행했습니다. 유효 24/24회가 assertion 의미 실패였고 생존·컴파일 오류·panic·timeout은 0입니다. 최초 record 연결 변이 6회는 닫힘 부재를 optional unwrap panic으로 검출해 증거에서 전부 제외하고, presence assertion을 추가한 v2 6회만 사용했습니다. 유효 로그는 `/tmp/hwpjs-polyline-mutants.YbFp8L/{start_first,no_previous,always_close,wrong_close,singleton_close,repeat_close}-{Debug,ReleaseSafe,ReleaseFast}.log`와 `{drawlines_open,polygon_open}-v2-{Debug,ReleaseSafe,ReleaseFast}.log`입니다.

변경 소스를 고정한 뒤 세 모드 전체 `audit`를 순차 실행했습니다. 각 모드는 40/40 단계와 1,923/1,923 테스트(native 1,884, chart 31, WMF 8), HWP/WASM 8,905,827 checks, imports 0을 통과했고 CFB 12,000 변이의 traps는 0입니다. 로그는 `/tmp/hwpjs-polyline-geometry-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
