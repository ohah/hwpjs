# EMF 기본 도형 records

## 범위와 명세

`basic_shapes.zig`는 Microsoft [EMR_ANGLEARC](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/3b04a2e2-9ba5-477f-b79c-5710635d04b9), [EMR_ELLIPSE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/d9462a32-d188-40e7-bf72-05614ec4ff18), [EMR_RECTANGLE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/3c471238-0a02-4992-90a2-bfd2afd98f2a), [EMR_ROUNDRECT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/2e4f55a1-5f69-4a81-8329-423eeedb3812), [EMR_ARC](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/3e148f19-7e75-43aa-9259-fda562f60315), [EMR_ARCTO](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/51b4a890-bfd4-496e-bbd9-dbde9ad49d1c), [EMR_CHORD](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/b442d2fb-f92b-4103-aa7d-44f864f719d5), [EMR_PIE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/c326f6b2-ae7e-447f-b8dc-02c703f054c3)의 고정 wire payload를 구분한다.

- ANGLEARC: Center PointL, Radius u32, StartAngle FLOAT, SweepAngle FLOAT를 포함한 28바이트
- ELLIPSE·RECTANGLE: Box RectL을 포함한 24바이트
- ROUNDRECT: Box RectL과 Corner SizeL을 포함한 32바이트
- ARC·ARCTO·CHORD·PIE: Box RectL, Start PointL, End PointL을 포함한 40바이트

선언 Size와 실제 slice 길이는 같아야 하고 필수 prefix가 잘리면 거부한다. [MS-EMF 상위 record 규칙](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e0137630-f3ad-492c-bde9-e68866e255ba)대로 필수 prefix 뒤의 미정의 extra data는 무시한다. 이 경계는 `record_extent.zig`가 소유하며 기본 점 레코드도 공유한다. PointL·SizeL·RectL의 signed i32 little-endian 해석은 `geometry.zig`만 소유한다. 비슷한 WMF 16비트 역순 배치를 재사용하지 않는다.

## 값 보존과 책임 경계

ANGLEARC의 Radius는 u32 원값으로 보존한다. 두 FLOAT는 f32로 정규화하지 않고 각각 u32 원비트를 소유하며 접근자에서만 bit-cast한다. 따라서 NaN payload, 무한대, 음수 0, 360도를 넘는 sweep도 파서가 임의 변경하거나 거부하지 않는다.

union tag는 같은 payload를 가진 ELLIPSE/RECTANGLE과 ARC/ARCTO/CHORD/PIE를 각각 구별한다. 펜·브러시 적용, arc direction, current position 갱신, 경로 조립, inclusive-inclusive 경계의 픽셀 재생은 후속 재생 계층의 책임이다. 구조 파싱 성공을 렌더링 지원으로 확대하지 않는다.

## 검증

- i32 최소·최대와 음수 좌표, u32 최대 반지름, NaN payload와 음수 각도 원비트를 확인한다.
- 8개 타입의 필수 prefix가 1바이트라도 잘리면 거부하고, 4바이트 extra는 수용하며, 선언 Size 불일치를 거부하는지 검사한다.
- 같은 배치의 타입도 서로 다른 union tag로 반환하며 LINETO를 claim하지 않는지 검사한다.
- 합성 전체 EMF의 ROUNDRECT를 통해 framing 연결과 잘못된 고정 길이 오류 전파를 검사한다.

## 적대적 검증 기록

임시 복사본에 다음 7개 변이를 각각 주입했다. 공용 경계·기본 점·기본 도형·framing integration을 직접 import하는 임시 test root가 167개 테스트를 수집하고 관련 테스트가 포함됨을 먼저 확인했다. 모든 변이는 Debug·ReleaseSafe·ReleaseFast에서 모두 검출됐고, 임시 test root는 제거했다.

- 공용 경계가 필수 prefix 잘림을 허용
- 공용 경계가 선언 Size와 slice 길이 불일치를 허용
- 공용 경계가 미정의 extra data를 거부
- ANGLEARC의 StartAngle과 SweepAngle wire 위치를 교환
- ARC 계열의 Start와 End PointL wire 위치를 교환
- framing의 basic shapes parser 호출을 제거
- RECTANGLE을 ELLIPSE union tag로 병합

호환성 수정 후 최종 `zig build audit --summary all`을 처음부터 재실행했다. Debug·ReleaseSafe·ReleaseFast 모두 40/40 단계와 1,352/1,352 테스트를 통과했다. 이 중 native test는 1,313개이고, HWP corpus는 584개 파일에 대해 8,905,827개 조건을 검사했다.

실제 HWP corpus에는 EMF가 없어 실제 한글 생성기 표본으로 검증하지 못했다.
