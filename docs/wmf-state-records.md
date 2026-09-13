# WMF 고정 길이 상태·좌표 레코드

## 명세와 SSOT

`mode_record.zig`는 Microsoft [META_SETBKMODE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/4703ae29-2123-4ab1-8b85-70ba241549b4), [META_SETROP2](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/8e632416-efc7-40ba-b692-5376cbcd4aad), [META_SETPOLYFILLMODE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/51c4e270-c9e4-4ed2-b538-e5df407eb477)의 mode WORD를 분기한다. background/poly-fill은 1~2, raster operation은 1~16만 허용한다. 세 레코드의 optional Reserved 때문에 정확한 4 WORD와 5 WORD 배치를 모두 허용하고 부재를 0으로 만들지 않으며, 존재하는 값은 MUST-ignore여도 보존한다.

`point_s.zig`가 signed x/y 값의 SSOT다. Pen Object의 wire X→Y는 `readXY`, [META_MOVETO](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/b92db99d-2adc-4823-9555-75fd0b7c26cd), [META_LINETO](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/bf92fda0-2d68-4ea2-8b31-6a0a22574d7f), [META_SETWINDOWORG](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/6e6195bf-6e89-467b-babc-2681eb290357), [META_SETWINDOWEXT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/28fbdde6-22ee-4e49-b162-abf826f5bc00)의 wire Y→X는 `readYX`로 이름을 분리한다. `point_record.zig`는 네 function과 정확한 5 WORD 크기를 검사하며 좌표를 양수로 축소하지 않는다.

`text_color.zig`는 [META_SETTEXTCOLOR](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/2bdfee2b-3016-4a6a-b4cd-c725ce9cb2a0)의 정확한 5 WORD와 function을 검사하고 기존 ColorRef parser와 명시적 reserved 정책을 재사용한다. `state_records.zig`는 공용 record Iterator에서 이 parser들을 조립하고 필드를 다시 읽지 않는다.

## 실제 HWP 대조와 범위

hash-pinned WMF 표본은 SETBKMODE 148개(transparent 60, opaque 88), SETROP2 1개, SETPOLYFILLMODE 4개(alternate/winding 각 2), SETTEXTCOLOR 96개다. 세 mode 종류는 모두 optional Reserved가 있는 5 WORD이고 reserved 0이다. text color 96개는 모두 ColorRef reserved `0x02`라 `specified_zero`는 거부하고 `observed_preserve`만 명시적으로 성공한다.

window origin은 `(x=60,y=1008)`, extent는 `(5464,2173)` 한 개씩이다. MOVETO 96개의 합은 x 267,579/y 143,072이고 LINETO 8개의 합은 x 20,994/y 13,754다. 독립 Node 순회와 Zig 집계가 이 수치와 일치한다. 좌표 합은 parser 오프셋·축 순서 검증용 fingerprint이지 기하 정당성이나 렌더링 결과가 아니다.

합성 검증은 XY/YX가 서로 다른 signed 값, function/크기 불일치, optional Reserved의 null/원값, mode 경계와 ColorRef strict/observed 분리를 검사한다. 현재 위치와 선을 연결한 path 의미, device-context 상태 전이, clipping/map mode 변환, polygon·ellipse·rectangle 및 픽셀 렌더링은 아직 완료로 세지 않는다.

적대적 검증은 (1) optional Reserved 없는 4 WORD mode 제거, (2) polygon mode 3 허용, (3) YX 좌표를 XY로 읽기, (4) text color를 항상 observed 정책으로 읽기, (5) move X 합에 Y를 연결하는 다섯 변이를 주입했다. Debug·ReleaseSafe·ReleaseFast의 15회 모두 실제 표본 또는 공개 API 합성 감사가 검출했고 각 변이는 원복했다.
