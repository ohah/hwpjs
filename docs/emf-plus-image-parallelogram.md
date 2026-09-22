# EMF+ DrawImagePoints parallelogram 조립

## 범위와 단일 출처

`src/image/emf/emf_plus_image_parallelogram.zig`는 DrawImagePoints의 정확히 세 destination point를 역할이 있는 `upper_left`, `upper_right`, `lower_left`와 파생 `lower_right`로 조립합니다. [DrawImagePoints wire parser](emf-plus-draw-image-points-record.md)는 Count·P/C·PointData 경계를, [절대 좌표 resolver](emf-plus-point-resolution.md)는 PointR 누적을 소유합니다. `DrawImagePoints.destinationParallelogram()`은 이 계층을 연결할 뿐 규칙을 복제하지 않습니다.

[MS-EMFPLUS EmfPlusDrawImagePoints](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/9bad3867-71b0-46fb-9b90-f7d8fb37ff76)는 세 점을 parallelogram의 upper-left, upper-right, lower-left 순서로 정의하고 네 번째 점을 앞의 세 점에서 외삽한다고 명시합니다. 이 모듈은 각 축에서 `lower_right = upper_right + lower_left - upper_left`를 적용합니다.

## 좌표와 소유권 계약

PointR은 원점부터 누적한 i64 절대 좌표 세 개를 사용합니다. absolute Point는 i16에서 i64로 확장한 뒤 계산하므로 파생점이 i16 범위를 벗어나도 좁히거나 wrap하지 않습니다. 세 source role은 원래 `resolved.Value`를 그대로 보존합니다. PointF source role은 signed zero·NaN을 포함한 원비트를 바꾸지 않으며 lower-right만 f32 산술로 파생합니다. 비유한 결과를 wire 오류로 거부하거나 정규화하지 않습니다.

입력을 빌리고 할당하지 않습니다. 공용 함수도 정확히 Count 3을 요구해 record parser 밖의 잘못된 호출을 거부합니다. 이미 검증된 borrowed bytes가 나중에 잘리면 resolver의 `UnexpectedEnd`를 다른 오류로 바꾸지 않습니다.

## 지원 경계

이 계층은 destination parallelogram topology까지만 구현합니다. SrcRect와 destination 사이의 좌표 변환은 [image affine map 계층](emf-plus-image-affine-map.md)이, 그 결과의 일반 world/page/device 연결은 [source→device map 계층](emf-plus-image-source-device-map.md)이 소비합니다. crop·픽셀 sampling, ImageAttributes, 선행 image effect, clipping, interpolation·pixel offset mode, compositing, rasterization과 저장은 후속 범위입니다. float 파생점의 플랫폼별 최종 raster 결과나 실제 한컴 출력 동등성을 주장하지 않습니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 0개입니다.

## 검증 기록

합성 fixture는 PointR 누적과 세 역할, 네 번째 점, i16 양 끝에서 i64 범위 밖 파생점, PointF signed-zero·NaN 원비트와 비유한 파생 결과, non-zero float 원점의 양 축 계산, Count 0~2·4와 borrowed relative 잘림을 검사합니다. 기존 relative DrawImagePoints fixture에서 `destinationParallelogram()` 공개 연결과 네 역할을 함께 확인합니다.

적대적 검증은 (1) Count 오류 종류 변경, (2) upper-right/lower-left 교환, (3) lower-left role 중복, (4~7) 정수 x/y의 origin 부호·lower-left 항 제거, (8~9) float x/y origin 부호 변경, (10) PointR 누적 제거, (11) 공개 method 결과 훼손, (12) upper-left role 훼손, (13) lower-right를 upper-right로 대체, (14) borrowed 잘림 오류 재매핑을 독립 복사본에 주입했습니다. 변이·모드별 local/global cache를 분리한 Debug·ReleaseSafe·ReleaseFast 42회가 모두 의미 assertion으로 검출됐습니다.

최초 float origin fixture가 `-0, 0`이라 origin을 더하는 두 변이가 6회 생존했고, PointR 치환은 Perl의 `@as` 해석 때문에 소스가 바뀌지 않은 채 3회 생존했습니다. 공개 method를 Count 오류로 바꾼 3회는 assertion이 아니라 예상 밖 오류 반환으로 종료했습니다. 이 12회는 유효 검출로 세지 않았습니다. non-zero float 원점 fixture를 추가하고, 실제 source diff를 확인한 PointR 변이와 값은 반환하되 lower-right를 훼손하는 공개 method 변이로 각각 새 복사본·cache에서 재실행했습니다. 최종 유효 42/42회에는 생존·컴파일 오류·panic·timeout이 없습니다. 제품 작업 트리에는 변이를 적용하지 않았습니다.

변경 소스를 고정한 뒤 전체 audit를 순차 실행했습니다. Debug·ReleaseSafe·ReleaseFast가 각각 40/40 단계와 1945/1945 테스트(코어 1906, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, imports 0이었고, strict mutation sweep는 12,000 mutations, traps 0이었습니다.
