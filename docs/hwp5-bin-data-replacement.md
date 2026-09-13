# HWP5 바깥 BinData 교체

## 계약과 책임

`hwp5/container/bin_data_replace.zig`의 `replaceDecoded`는 HWP CFB 자체에서 `/FileHeader`를 strict exact 경로로 읽고, caller가 지정한 DocInfo `BinData` 항목의 정확한 `/BinData/BINhhhh[.extension]` stream을 디코딩된 새 bytes로 교체합니다. caller가 별도 Header나 경로 문자열을 주입하지 않으므로 저장 대상과 압축 기본값은 같은 파일에서 유도됩니다.

경로 생성은 기존 `container/paths.binary`, 항목별 저장 형식은 [BinData 인코딩 정책](hwp5-bin-data-encoding.md), CFB 재생성은 공통 `cfb/stream_replace.zig`를 사용합니다. 내부 OLE 교체도 같은 CFB 재생성 함수를 호출하므로 compact node mapping·version 보존·stream 선택·writer 호출은 한 곳만 소유합니다.

입력은 항상 strict CFB로 열고 원래 major version 3/4를 유지합니다. FileHeader, DocInfo, 다른 stream/storage 내용과 메타데이터는 canonical CFB writer의 보존 계약을 따릅니다. 입력·decoded bytes는 빌리며 반환 파일은 caller 소유입니다. encoded BinData와 최종 CFB 한도는 독립적입니다.

## 검증

CFB v3/v4, FileHeader 기본 압축 true/false, 항목 default/compressed/uncompressed의 12조합을 검사합니다. 저장 파일을 strict CFB로 다시 열어 version, 형제 stream, BinData storage state를 확인하고, 저장된 stream을 같은 Header/항목 정책으로 decode하여 원문과 대조합니다. 각 조합의 모든 할당 실패 지점도 검사합니다. 별도 `BIN0001.OLE` fixture는 embedding의 명세 확장자와 storage의 관측 선택 확장자 두 경로를 모두 저장하며, 같은 storage를 specified로 해석하면 확장자 없는 다른 경로가 되어 `MissingHwpEntry`인지 확인합니다.

없는 저장 ID, reserved 압축, encoded 한도, 최종 CFB 한도와 strict CFB 헤더 위반은 정확한 오류로 거부합니다.

적대적 변이 검증에서는 strict 읽기 해제, BinData ID를 다음 값으로 오선택, 압축 인코딩 우회, compact CFB node를 다음 값으로 오선택, 출력 CFB version 3 강제의 다섯 결함을 각각 주입했습니다. Debug·ReleaseSafe·ReleaseFast의 15개 실행 모두 컴파일 성공 뒤 런타임 assertion 실패로 검출했습니다. 실행 로그는 `/tmp/hwpjs-outer-bin-data-mutants.Xkj0fS`에 남겼습니다.

## 남은 범위

caller가 전달한 BinData 항목이 실제 `/DocInfo`의 특정 레코드와 동일한지 이 API가 다시 탐색하지는 않습니다. 항목 추가·삭제와 DocInfo 수정, 암호화/DRM 쓰기, 외부 LINK, 여러 stream의 원자적 편집 세션, 공개 JS API는 별도 범위입니다. 실제 차트 편집 전체 연결은 내부 OLE와 Contents writer를 함께 호출하는 상위 작업이 남아 있습니다.
