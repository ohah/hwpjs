# EMF clipping selection과 RegionData

## 명세와 책임

Microsoft [EMR_SELECTCLIPPATH](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/4a26bcf8-6607-4a09-8ec3-a8768eadc8e8), [EMR_EXTSELECTCLIPRGN](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/c6b9f4e6-27f6-4a4d-a383-c2daf5da11d9), [RegionMode](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/b7f99f50-dd2f-4528-9624-f74140368019), [RegionData](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e66601f2-9b5c-4619-8476-ddb7b087551b), [RegionDataHeader](https://learn.microsoft.com/kk-kz/openspecs/windows_protocols/ms-emf/5ca68a15-1811-45b6-a51b-5e40d1055ccc)를 기준으로 한다.

책임은 다음처럼 분리한다.

- `region_mode.zig`: AND, OR, XOR, DIFF, COPY의 정확한 값 1~5
- `region_data.zig`: 32바이트 RegionDataHeader, bounds, CountRects개의 16바이트 RectL 배열과 indexed view
- `clipping_selection.zig`: 12바이트 SELECTCLIPPATH 및 RgnDataSize를 가진 EXTSELECTCLIPRGN record 조립

RegionDataHeader의 Size는 32, Type은 1이어야 한다. 실제 rectangle 배열은 `CountRects × 16`과 외부 `RgnDataSize`로 경계를 정한다. `RgnSize`는 그 값과 같거나 0이어야 한다. 같은 Win32 [RGNDATAHEADER](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-rgndataheader)는 buffer size를 모르면 0일 수 있다고 명시하므로 0을 손상으로 보정하거나 거부하지 않고 원값을 보존한다. 그 외의 비영 크기 불일치는 거부한다.

EXTSELECTCLIPRGN에서 `RgnDataSize=0`은 mode가 COPY일 때만 RegionData 부재로 수용한다. 크기가 0이 아니면 선언 범위만 RegionData parser에 전달한다. [EMF record 공통 호환성 규칙](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e0137630-f3ad-492c-bde9-e68866e255ba)에 따라 그 범위 뒤의 문서화되지 않은 record data는 거부하지 않고 별도 `trailing_data` view로 보존한다. 내부 객체 크기와 record 전체 크기를 같은 값으로 취급하지 않는다.

`framing.zig`는 두 record를 모두 연결하고 selection record 수를 Summary에 보존한다. RegionData의 bounds 재계산, rectangle의 정렬·겹침 검사, 실제 region boolean 연산과 SELECTCLIPPATH의 현재 path 소비는 명시적인 wire 제약이 아니며 playback 계층에서 다룬다.

같은 RegionData 객체를 사용하는 fill/frame/invert/paint record는 [RegionData drawing records](emf-region-drawing.md)가 소유한다.

## 검증 기록과 한계

다섯 mode와 인접 미정의 값, RegionData Header Size/Type, signed bounds·rectangle 순서, count 기반 실제 크기, `RgnSize=0`과 잘못된 비영 크기, 모든 잘림·초과, rectangle index, COPY만 허용되는 빈 data, 선언된 nested 범위와 후행 record data 분리, 무관 record 비수용, framing 연결을 직접 검사한다.

미정의 mode 허용, Header Size/Type 제거, 비영 RgnSize 불일치 허용, RgnSize 0 거부, 실제 extent 완화, index 상한 완화, non-COPY 빈 data 허용, nested 범위 무시, record 후행 data 거부, framing 연결 제거의 11개 변이는 Debug·ReleaseSafe·ReleaseFast에서 모두 탐지되어 `33/33` 실행이 실패했다.

정상 소스의 Debug·ReleaseSafe·ReleaseFast 전체 audit은 각 `40/40` 단계와 `1,370/1,370` 테스트를 통과했다.

실제 HWP corpus에는 EMF BinData가 없어 실제 한글 생성기의 RegionData 변형을 검증했다는 뜻은 아니다. 이 파트는 바이트 구조와 보존 경계이며 clipping 결과 렌더링 완료가 아니다.
