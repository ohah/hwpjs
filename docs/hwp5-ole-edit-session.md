# HWP5 파일 단위 OLE 편집 세션

## 계약과 책임

`src/hwp5/container/ole_edit_session.zig`의 `apply`는 하나 이상의 OLE BinData 편집 명령을 파일 단위로 조합합니다. 명령은 실제 DocInfo의 엄격히 증가하는 1-based BinData 순번, 명시적 OLE envelope 배치, 하나 이상의 exact 내부 stream replacement를 가집니다. caller는 Header, storage ID나 물리 CFB 경로를 주입하지 않습니다.

준비 단계는 strict HWP CFB의 FileHeader와 bounded DocInfo를 읽고 기존 `resources.inspectBinDataOrdinals`로 모든 항목 및 known count를 검증합니다. 각 실제 BinData stream을 항목별 압축 정책으로 해제하고 [OLE 내부 원자적 교체](hwp5-ole-stream-replacement.md)를 실행합니다. 모든 내부 결과가 성공한 뒤 [HWP BinData 원자적 저장](hwp5-bin-data-replacement.md)에 전달하므로 바깥 CFB writer는 한 번만 호출됩니다. HWP batch가 같은 불변 입력의 DocInfo를 다시 검사하는 것은 방어적 재검증이며 별도 선택 규칙이나 상태 복사본을 만들지 않습니다.

`max_decoded_bin_data_bytes`는 항목별 입력 해제량, `max_total_decoded_bin_data_bytes`는 전체 입력 해제량, `ole.max_output_bytes`는 OLE별 결과량, `max_total_edited_ole_bytes`는 모든 내부 결과의 합을 제한합니다. 이어 HWP batch의 항목별·전체 encoded 한도와 최종 CFB 한도가 적용됩니다. 모든 입력과 명령은 빌리며 성공한 최종 HWP만 caller가 소유합니다.

## 검증

합성 HWP v3 안의 유효한 IdMappings와 두 storage BinData가 각각 내부 CFB v4를 가집니다. 두 명령이 각 OLE의 `A`·`B` stream을 역순 batch로 교체하고 내부 `Keep`과 바깥 `OuterKeep`을 보존합니다. 최종 HWP를 strict 재개방하고 두 내부 CFB도 strict 재개방해 네 변경값, 두 보존값과 양쪽 version을 끝단에서 확인하며 모든 할당 실패 지점을 검사합니다.

빈 명령, 명령 수 한도, 역순·중복 순번, 전체 decoded 한도, 두 번째 OLE에서 실패하는 전체 edited 한도, 두 번째 손상 OLE, 두 번째 물리 BinData 누락을 결과 없이 거부합니다. 실패 뒤 원본 HWP stream은 변경되지 않습니다.

적대적 변이 검증은 세션 resource 검증 우회, 전체 decoded 한도 우회, 전체 edited OLE 한도 우회, 각 내부 OLE의 첫 replacement만 적용, 바깥 HWP의 첫 BinData만 적용을 각각 주입했습니다. 최초 resource 검증 우회는 최종 HWP batch의 방어적 재검증으로 같은 오류가 나서 살아남았습니다. count 불일치와 두 번째 OLE 손상을 결합해 조기 `ResourceCountMismatch` 우선순위를 검사하도록 보강한 뒤 재실행했습니다. 보강 후 Debug·ReleaseSafe·ReleaseFast의 유효한 15개 실행 모두 컴파일 성공 뒤 테스트 실패로 검출했습니다.

## 남은 범위

이 계층은 replacement bytes의 의미를 해석하지 않습니다. 현재 실제 차트 Contents writer 결과를 단일 OLE·바깥 HWP로 저장하는 연결은 검증되어 있지만, 여러 실제 차트 의미 편집을 이 명령 배열로 만드는 typed API는 별도입니다. DocInfo 항목 추가·삭제, 본문 참조 수정, 암호화/DRM, 외부 LINK, 차트 외 OLE 애플리케이션 의미는 지원 범위가 아닙니다.
