# EMF 비트맵 브러시

## 공식 형식과 책임 경계

Microsoft의 [EMR_CREATEMONOBRUSH](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/49b42277-31b0-4eb9-a6af-86d9be9b568f)와 [EMR_CREATEDIBPATTERNBRUSHPT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/332116b4-c6f9-4b18-a7cc-22c531b52afc)는 같은 32바이트 prefix를 사용한다. `bitmap_brush_creation.zig`가 record 종류, 선언 `Size`, handle, DIBColors와 네 offset/size 필드를 소유한다. 선언 범위와 필수 prefix 판정은 `record_extent.zig`를 재사용한다.

`dib_sections.zig`는 offset/size 산술과 slice 경계의 단일 출처다. 고정부와 BmiSrc 사이 UndefinedSpace를 별도 보존하고, BmiSrc와 BitsSrc가 연속된 packed DIB인지 확인한다. BmiSrc와 BitsSrc는 각각 `cbBmi`, `cbBits`가 지정한 정확한 범위만 노출한다. BitsSrc 뒤 4바이트 정렬까지의 0~3바이트만 padding이며, 그 이후 record extra data는 의미 payload에 섞지 않고 무시한다.

`dib_payload.zig`는 BMP header parser를 재사용해 DIB 구조와 pixel 길이를 검사한다. MONOBRUSH에는 1bpp를 요구한다. `object_table.zig`는 이 모든 검증이 성공한 뒤에만 brush handle을 생성하거나 교체한다.

이 문서는 비트맵 브러시만 소유한다. 같은 section parser를 쓰는 EXTCREATEPEN의 가변 LogPenEx와 선택 DIB 조립은 [EMF 확장 펜](emf-extended-pen.md)이 소유한다. JPEG·PNG·RLE·CMYK 픽셀 해제와 실제 brush 렌더링도 현재 범위가 아니다.

## 검증

명시적 test root에서 관련 모듈과 framing의 168개 테스트를 통과했다. 64바이트 확장 record로 `cbBits`가 지정한 8바이트와 정렬 padding 2바이트가 그대로 유지되고, 뒤의 4바이트 extra data가 어느 slice에도 혼입되지 않는지 직접 검사한다. 합성 EMF에서도 확장 브러시 다음 EOF의 record 경계와 Object Table 상태를 확인한다.

임시 복사본에 다음 7개 결함을 각각 주입했다. Debug·ReleaseSafe·ReleaseFast의 21회 실행이 모두 결함을 검출했고 변형은 제품 소스에 남기지 않았다.

- record 끝 전체를 padding으로 취급하고 3바이트 초과를 거부
- extra data를 padding slice에 혼입
- padding까지 pixel bits로 혼입
- BitsSrc 끝의 정렬 padding을 누락
- 선언 `Size`와 실제 slice 불일치를 허용
- 비연속 BmiSrc/BitsSrc를 허용
- Object Table의 bitmap brush 등록을 제거

실제 HWP corpus 584개에는 EMF가 0개이므로 실생성기 호환성 근거로 확대하지 않는다. 최종 `zig build audit --summary all`은 Debug·ReleaseSafe·ReleaseFast 모두 40/40 단계와 1,353/1,353 테스트를 통과했다. 이 중 native test는 1,314개이고 HWP5 감사에서 8,905,827개 조건을 검사했다.
