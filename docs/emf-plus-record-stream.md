# EMF+ record stream

## 범위와 책임

`emf_plus_record_type.zig`는 공식 EMF+ `RecordType` 값 0x4001~0x403A의 단일 대응표를 소유합니다. `emf_plus_record.zig`는 모든 EMF+ 레코드가 공유하는 12바이트 머리와 comment 내부 iterator를, `emf_plus_header.zig`는 Header 전용 필드를, `emf_plus_stream.zig`는 여러 `EMR_COMMENT_EMFPLUS` 사이의 시작·종료 상태를 소유합니다. 외부 `EMR_COMMENT`의 DataSize·identifier·padding은 [comment envelope](emf-comment-envelope.md)가 계속 소유합니다.

각 EMF+ 레코드는 Type u16, Flags u16, Size u32, DataSize u32와 data로 구성됩니다. Size와 DataSize는 4바이트 정렬이어야 하고 `Size == 12 + DataSize`여야 합니다. iterator는 선언 크기가 현재 comment를 벗어나면 거부하며 다음 comment에서 조각을 보충하지 않습니다. 공식 `EMR_COMMENT_EMFPLUS`가 각 comment에 **하나 이상의 EMF+ records**를 요구하므로 빈 parameter와 잘린 마지막 레코드도 오류입니다.

Header는 EMF Header 바로 다음 EMF record의 첫 EMF+ record여야 합니다. 정확한 Size 28/DataSize 16, `EmfPlusGraphicsVersion`의 20비트 signature 0xDBC01을 검사하고 12비트 graphics version은 원값으로 보존합니다. 명세가 vendor extension을 허용하므로 알려진 1/2 이외 값을 임의로 거부하지 않습니다. Header Flags의 D와 EmfPlusFlags의 V를 해석하되 나머지 비트는 명세대로 무시하면서 원값을 보존합니다.

EndOfFile과 GetDC는 Size 12/DataSize 0을 검사하고 사용되지 않는 Flags는 거부하지 않습니다. EndOfFile은 전체 EMF+ 스트림에서 정확히 마지막 EMF+ record이며 같은 comment의 후속 record나 이후 EMF+ comment를 허용하지 않습니다. EMF+가 시작되었으면 EMF EOF 전에 EndOfFile이 있어야 합니다. EMF+가 전혀 없는 일반 EMF는 기존과 같이 허용합니다.

## 명세 근거

- [MS-EMF EMR_COMMENT_EMFPLUS](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/929b78e1-b848-44a5-9fac-327cae5c2ae5)
- [MS-EMFPLUS EmfPlusHeader](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/fa7c00e7-ef14-4070-b12a-cb047d964ebe)
- [MS-EMFPLUS EmfPlusGraphicsVersion](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/a60a681e-49ae-4103-a8ce-ef9f65a73fc1)
- [MS-EMFPLUS GraphicsVersion](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/e71e18d6-9e78-4df2-8da8-ae4a305b237b)
- [MS-EMFPLUS EmfPlusEndOfFile](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/d2ba1822-cc1f-413e-bd5b-91c094241da5)
- [MS-EMFPLUS EmfPlusGetDC](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/b7879ac2-355d-4419-8e65-e2e4de4fa4a9)
- [Microsoft GDI+ EmfPlusRecordType](https://learn.microsoft.com/en-us/windows/win32/api/gdiplusenums/ne-gdiplusenums-emfplusrecordtype)

## 검증과 미구현 경계

단위 테스트는 전체 type 범위와 양쪽 인접값, 모든 1~11바이트 header 잘림, 최소/비정렬/불일치/최대 선언 크기, iterator 실패 원자성, Header signature와 크기, 여러 comment의 상태 연속, 빈 comment, Header 위치·중복, EOF 누락·후속 record를 검사합니다. 상위 framing 테스트는 정상 Header/EOF 보고서와 signature·빈 comment·지연 Header·EOF 누락 오류 전파를 확인합니다.

적대적 검토는 (1) 공식 필드와 enum, (2) 정수·extent, (3) 상태 전이와 실패 원자성, (4) fixed control과 버전 호환성, (5) 상위 framing 연결·SSOT의 다섯 관점으로 수행했습니다. 별도 Zig cache를 쓰는 격리 복사본에서 type 상한, Size/DataSize 관계, metafile signature, Header 위치, Header 크기·중복, EOF 누락·후속 record, GetDC 크기, 빈 comment, 상위 routing을 각각 무력화한 11개 유효 변형을 Debug·ReleaseSafe·ReleaseFast에서 실행했고 33/33회를 모두 검출했습니다. 문자열 치환이 적용되지 않은 시도, 미사용 변수로 컴파일이 깨진 시도, 원본 작업 디렉터리를 실행한 시도는 검출 수에 포함하지 않았습니다. 이 과정에서 `Size == 12 + DataSize`와 Size 정렬로부터 자동 유도되는 DataSize 정렬 검사를 중복 SSOT로 확인해 제거했습니다.

변경 소스를 고정한 뒤 Debug·ReleaseSafe·ReleaseFast 전체 `audit`를 순차 실행했습니다. 각 모드는 40/40 단계, 전체 1,493/1,493 테스트(공통 native 1,454, 별도 chart 31, WMF 8), HWP/WASM 8,905,827회 검사를 통과했습니다. 기존 CFB 변이 12,000회도 trap 0이며 로그는 `/tmp/hwpjs-emf-plus-stream-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.

이 파트는 공통 record stream과 Header/EndOfFile/GetDC control record의 구조 완료입니다. [Comment 보존과 reserved MultiFormat 거부](emf-plus-comment-records.md), Object·SerializableObject, [Clear](emf-plus-clear-record.md), [DrawArc](emf-plus-draw-arc-record.md), [DrawBeziers](emf-plus-draw-beziers-record.md), [DrawClosedCurve](emf-plus-draw-closed-curve-record.md), [DrawCurve](emf-plus-draw-curve-record.md), [DrawDriverString](emf-plus-draw-driver-string-record.md), [DrawEllipse](emf-plus-draw-ellipse-record.md), [DrawImage](emf-plus-draw-image-record.md), [DrawImagePoints](emf-plus-draw-image-points-record.md), [DrawLines](emf-plus-draw-lines-record.md), [DrawPath](emf-plus-draw-path-record.md), [DrawPie](emf-plus-draw-pie-record.md), [DrawRects](emf-plus-draw-rects-record.md), [DrawString](emf-plus-draw-string-record.md), [SetRenderingOrigin](emf-plus-set-rendering-origin-record.md), [SetAntiAliasMode](emf-plus-set-anti-alias-mode-record.md), [SetTextRenderingHint](emf-plus-set-text-rendering-hint-record.md), [SetTextContrast](emf-plus-set-text-contrast-record.md)과 [SetInterpolationMode](emf-plus-set-interpolation-mode-record.md)은 후속 계층에서 구현했습니다. 나머지 drawing, property, state, transform, clipping 및 terminal-server record의 **개별 payload 의미**는 아직 구현하지 않았습니다. 일반 type으로 경계와 원문 data를 읽을 수 있다는 사실을 해당 payload 지원 완료로 세지 않습니다. Save/Restore 및 Container 상태, 실제 재생·렌더링도 후속 범위입니다. 지원 HWP corpus에서 EMF+ signature 표본이 0개였으므로 실제 HWP EMF+ 동등성은 아직 주장하지 않습니다.
