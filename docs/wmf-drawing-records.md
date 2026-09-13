# WMF polygon·polyline·ellipse·rectangle 레코드

## 명세와 책임 분리

Microsoft [META_POLYGON](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/0982bbfc-feb7-4f06-a8fb-ad03b465ffea)과 [META_POLYLINE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/ed4e99ac-1c56-42f0-ae01-e4979ceb934c)는 signed 16-bit NumberOfPoints 뒤에 그 수만큼 32-bit PointS를 둔다. `poly_record.zig`는 function, 음수 개수, polygon 최소 2점과 `4 + count*2` WORD의 정확한 record 크기를 검사한다. polyline은 명세에 최소값이 없어 0점도 polygon과 구분해 보존한다.

`point_array.zig`는 입력을 복사하지 않는 PointS 배열 view이며, 인덱스 범위와 `count*4`의 정확한 byte 길이를 소유한다. 각 점의 wire 순서 X→Y는 기존 `point_s.readXY`를 재사용한다. 개수에 맞춰 부족한 점을 줄이거나 남는 좌표를 무시하지 않는다.

Microsoft [META_ELLIPSE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/fefd2347-2bb3-4865-b752-c4e80b6f2711)와 [META_RECTANGLE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/a8da53a6-f756-49f7-b835-f6d145ede760)은 정확한 7 WORD이며 wire 순서는 Bottom→Right→Top→Left다. `rect_record.zig`는 signed 네 좌표를 이름 있는 Rect로 옮기되 좌표 대소관계나 양수를 강제하지 않는다. `drawing_records.zig`는 공용 record Iterator에서 세 parser/view를 조립하고 필드 읽기를 복제하지 않는다.

## 실제 HWP 대조와 범위

hash-pinned WMF 표본의 polygon은 2개이며 각각 228점·460 WORD다. 총 456점의 합은 x 2,100,296/y 698,698이다. polyline은 51개로 2점 47개, 3점 2개, 25점 2개이고 총 150점의 합은 x 441,001/y 271,796이다. 선언 개수와 실제 parameter 길이는 모두 정확히 일치한다.

ellipse 64개와 rectangle 46개는 모두 7 WORD다. ellipse의 left/top/right/bottom 합은 159,886/124,086/170,390/129,686이고 rectangle 합은 121,796/83,018/145,226/87,922다. 독립 Node 순회와 Zig 공개 API 집계를 대조해 개수뿐 아니라 모든 좌표가 fingerprint에 참여한다.

합성 검증은 signed XY, 배열 끝 인덱스, 잘린·남는 byte, 음수/0/1/2점, function/크기 불일치와 Bottom/Right/Top/Left 오프셋을 검사한다. polygon 닫힘, 선분 연결, fill rule 적용, 사각형 정규화, 현재 pen/brush 선택, clipping 및 픽셀 렌더링은 아직 완료로 세지 않는다.

적대적 검증은 (1) polygon 1점 허용, (2) 선언 record WORD 크기 대조 우회, (3) PointS를 YX로 읽기, (4) Rect left를 top 오프셋에서 읽기, (5) 공통 집계의 X 합에 Y를 연결하는 다섯 변이를 주입했다. Debug·ReleaseSafe·ReleaseFast의 15회 모두 실제 표본 또는 공개 API 합성 감사가 검출했고 각 변이는 원복했다.
