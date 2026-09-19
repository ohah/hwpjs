# EMF+ Pen 객체

## 책임과 구조

`src/image/emf/emf_plus_pen.zig`는 [EmfPlusPen](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/7af4bee7-b3e0-47c5-9678-ffcbb234e378)의 GraphicsVersion, 반드시 0인 Type, PenData와 뒤따르는 BrushObject의 경계를 소유합니다. PenData가 flag로 선언된 필드만 순서대로 소비한 뒤 남은 정확한 slice를 기존 [Brush parser](emf-plus-brush-object.md)에 전달합니다. 완성된 Object assembler 결과는 ObjectTypePen인지 확인하며 기본 객체 한도는 64 MiB입니다.

`emf_plus_pen_values.zig`는 PenData 13개 flag, UnitType, LineStyle, sparse DashedLineCapType과 PenAlignment의 공식 domain을 한 번만 정의합니다. 시작·끝 cap과 join은 [CustomLineCap 계층](emf-plus-custom-line-cap.md)의 공통 LineCapType·LineJoinType을 재사용합니다. 정의되지 않은 flag와 enum 값은 지원 값으로 보정하지 않습니다.

`emf_plus_pen_data.zig`는 [EmfPlusPenData](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/33d8ced5-7768-47aa-a082-a14e5dfabc96)와 [EmfPlusPenOptionalData](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/5ef071f3-f503-4f16-b027-7c4bcf2d1d81)의 wire 순서를 소유합니다. Transform, StartCap, EndCap, Join, MiterLimit, LineStyle, DashedLineCap, DashOffset, DashedLine, PenAlignment, CompoundLine, CustomStartCap, CustomEndCap을 flag 비트 순서로만 읽습니다. 실패 시 공유 reader 위치를 보존합니다.

`emf_plus_pen_array.zig`는 DashedLineData와 CompoundLineData의 u32 element count와 빌린 f32 배열을 공유합니다. count×4는 checked 산술과 호출자 한도로 검사합니다. CompoundLine 값은 명세대로 0.0~1.0 범위에서 엄격히 증가해야 하며 비교식으로 NaN도 거부합니다. DashedLine 값에는 명세에 없는 양수·유한성 제약을 추가하지 않습니다.

`emf_plus_sized_custom_line_cap.zig`는 CustomStartCapData와 CustomEndCapData의 u32 byte size를 소유합니다. 선언한 정확한 slice만 기존 CustomLineCap parser에 전달하고 한도·잘림·중첩 오류 때 cursor를 갱신하지 않습니다.

MS-EMFPLUS 2.2.2.11과 2.2.2.15의 개별 객체 설명은 각각 일반 `PenDataEndCap`·`PenDataStartCap`을 언급하지만, PenData flag 표와 2.2.2.34의 wire 순서는 별도 `PenDataCustomEndCap`(0x1000)·`PenDataCustomStartCap`(0x0800)을 지정합니다. 파서는 후자의 명시적 bit와 optional wire 표를 따르며 일반 cap bit와 custom cap payload를 결합하거나 추측하지 않습니다.

## 검증과 미지원 경계

합성 fixture는 모든 13개 선택 필드의 wire 순서와 단독 flag 귀속, 두 custom cap 종류, PenData 모든 prefix 잘림, enum gap·예약 flag, 배열 count 한도·잘림·Compound 범위와 순서, 중첩 cap 크기·한도·원자성, Pen 모든 prefix 잘림, Type 0, Brush 경계, 객체 한도와 ObjectType을 검사합니다. 공통 Transform·Brush·CustomLineCap parser의 기존 테스트도 같은 제품 루트에서 실행됩니다.

현재 corpus에는 EMF+ Pen 실표본이 확인되지 않았으므로 한컴 버전별 생성 차이 또는 GDI+ 렌더링 동등성을 실측 완료했다고 주장하지 않습니다. 이 계층은 wire 구조를 빌려 읽으며 stroke 래스터화, dash 전개, cap·join geometry 계산, 단위 변환, Brush 적용과 재직렬화는 구현하지 않습니다.

## 적대적 검증 기록

18개 결함(PenData 예약 bit, DashedLineCap·UnitType·LineStyle·PenAlignment domain, 배열 한도, Compound 범위·엄격 증가, custom cap 크기·한도, Start/End 순서, custom cap 선택 bit, Transform 선택 bit, Pen Type, Brush 경계, 객체 한도·ObjectType, 오류 cursor 조기 commit)을 각각 독립 복사본에 주입했습니다. 변이별 새 로컬·전역 Zig cache에서 Debug·ReleaseSafe·ReleaseFast를 실행해 유효한 54/54를 모두 테스트 실패로 검출했으며 컴파일 실패나 분류되지 않은 종료는 없습니다.

최초 배치에서 음수 Compound 값을 허용한 결함이 세 모드에서 생존해 하한·상한·NaN fixture를 추가했습니다. 또한 Brush 시작을 뒤로 이동한 최초 결함은 안전 모드에서 slice trap을 일으켜 유효 변이에서 제외하고, 앞의 유효 바이트부터 Brush로 오인하는 동작 결함으로 교체했습니다. 두 교체 결함은 세 모드 6/6에서 검출했습니다. 변이 복사본은 `/tmp/hwpjs-emfplus-pen-mutants.v78dnT`, 유효 로그는 `/tmp/hwpjs-pen-mutation-<변이>-<모드>.log`와 두 교체 결과의 `/tmp/hwpjs-pen-mutation-rerun-<변이>-<모드>.log`입니다.

전체 감사는 Debug·ReleaseSafe·ReleaseFast를 순차 실행했고 각 모드에서 40/40 단계와 1599/1599 테스트가 통과했습니다. 구성은 제품 루트 네이티브 1560개, 차트 소유권 31개, WMF Contents 8개이며 HWP/WASM 감사도 각 모드에서 8,905,827 checks와 imports 0을 보고했습니다. 로그는 `/tmp/hwpjs-emfplus-pen-Debug-audit.log`, `/tmp/hwpjs-emfplus-pen-ReleaseSafe-audit.log`, `/tmp/hwpjs-emfplus-pen-ReleaseFast-audit.log`입니다.
