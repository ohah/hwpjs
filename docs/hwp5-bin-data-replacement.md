# HWP5 바깥 BinData 교체

## 계약과 책임

`hwp5/container/bin_data_replace.zig`의 고수준 `replaceDecodedAt`는 HWP CFB 자체에서 `/FileHeader`와 `/DocInfo`를 strict exact 경로로 읽고, 실제 DocInfo의 1-based `BinData` 순번을 storage ID와 혼동하지 않고 선택합니다. DocInfo는 같은 Header의 일반 stream 정책으로 bounded decode합니다. 기존 `docinfo/resources.zig`의 단일 전체 순회가 선택과 실제 리소스 집계를 함께 수행하므로 뒤쪽 오류를 숨기거나 별도 선택 목록을 만들지 않습니다. 이어 `validateKnownCounts`로 IdMappings의 BinData·7개 언어 글꼴·서식 7종과 버전상 존재하는 선택 리소스 선언을 실제 레코드 수와 대조한 뒤, 선택된 실제 항목의 정확한 `/BinData/BINhhhh[.extension]` stream만 교체합니다.

저수준 `replaceDecoded`는 이미 신뢰할 수 있는 `BinData` 값을 가진 내부 조합용으로 유지합니다. 두 API 모두 caller가 Header나 경로 문자열을 주입할 수 없고, 공통 `replaceOpened`가 압축·경로·CFB 저장을 한 번만 소유합니다.

경로 생성은 기존 `container/paths.binary`, 항목별 저장 형식은 [BinData 인코딩 정책](hwp5-bin-data-encoding.md), CFB 재생성은 공통 `cfb/stream_replace.zig`를 사용합니다. 내부 OLE 교체도 같은 CFB 재생성 함수를 호출하므로 compact node mapping·version 보존·stream 선택·writer 호출은 한 곳만 소유합니다.

입력은 항상 strict CFB로 열고 원래 major version 3/4를 유지합니다. FileHeader, DocInfo, 다른 stream/storage 내용과 메타데이터는 canonical CFB writer의 보존 계약을 따릅니다. 입력·decoded bytes는 빌리며 반환 파일은 caller 소유입니다. encoded BinData와 최종 CFB 한도는 독립적입니다.

## 검증

CFB v3/v4, FileHeader 기본 압축 true/false, 항목 default/compressed/uncompressed의 12조합을 검사합니다. 저장 파일을 strict CFB로 다시 열어 version, 형제 stream, BinData storage state를 확인하고, 저장된 stream을 같은 Header/항목 정책으로 decode하여 원문과 대조합니다. 각 조합의 모든 할당 실패 지점도 검사합니다. 별도 `BIN0001.OLE` fixture는 embedding의 명세 확장자와 storage의 관측 선택 확장자 두 경로를 모두 저장하며, 같은 storage를 specified로 해석하면 확장자 없는 다른 경로가 되어 `MissingHwpEntry`인지 확인합니다. 순번 기반 검증은 압축/비압축 DocInfo의 유효한 IdMappings와 두 실제 레코드 중 두 번째가 가리키는 storage ID 9만 교체하고 첫 stream을 보존하며 모든 할당 실패를 검사합니다. 0·범위 밖 순번, DocInfo 출력 한도, 선택 뒤 레코드 한도, BinData 선언 불일치·음수 선언·서식 선언 불일치도 거부합니다.

없는 저장 ID, reserved 압축, encoded 한도, 최종 CFB 한도와 strict CFB 헤더 위반은 정확한 오류로 거부합니다.

DocInfo 순번 결합의 적대적 변이 검증은 0번 허용, 선택 직후 조기 반환, DocInfo 압축 해제 우회, 순번 +1 오선택, storage ID +1 오선택을 각각 주입했습니다. Debug·ReleaseSafe·ReleaseFast의 15개 실행 모두 컴파일 성공 뒤 테스트 실패로 검출했습니다.

IdMappings 일관성 강화의 적대적 변이 검증은 known 검증을 구형 부분 검증으로 축소, 검증 전체 우회, 첫 BinData로 선택 고정, 선택 직후 순회 중단, BinData 선언 슬롯을 한국어 글꼴 슬롯으로 오독하는 다섯 결함을 주입했습니다. 최초 순회 중단 변이가 살아남아 레코드 한도 검사의 위치 편향을 확인했고, 한도를 선택 직후로 옮긴 뒤 재실행했습니다. 보강 후 Debug·ReleaseSafe·ReleaseFast의 15개 실행 모두 컴파일 성공 뒤 테스트 실패로 검출했습니다.

적대적 변이 검증에서는 strict 읽기 해제, BinData ID를 다음 값으로 오선택, 압축 인코딩 우회, compact CFB node를 다음 값으로 오선택, 출력 CFB version 3 강제의 다섯 결함을 각각 주입했습니다. Debug·ReleaseSafe·ReleaseFast의 15개 실행 모두 컴파일 성공 뒤 런타임 assertion 실패로 검출했습니다. 실행 로그는 `/tmp/hwpjs-outer-bin-data-mutants.Xkj0fS`에 남겼습니다.

## 실제 차트 전체 연결

실제 차트 fixture로 String fork, 내부 OLE `/Contents` 교체, 실제 압축 DocInfo의 첫 `BinData` 순번 선택, 기본 압축이 켜진 바깥 HWP `BIN0001.OLE` 교체를 연속 실행합니다. 저장 결과를 strict HWP CFB로 다시 열어 raw DEFLATE를 해제하고, strict 내부 CFB로 다시 연 뒤 최종 Contents를 재파싱합니다. 바깥 v3·안쪽 v4, 양쪽 보존 stream, 새 object ID·문자열·trailer를 끝단에서 대조하므로 각 계층의 단독 성공만 확인하는 테스트가 아닙니다.

전체 연결의 적대적 검증은 내부 Contents 경로 오선택, 바깥 BinData ID 오선택, FileHeader 압축 플래그 제거, 저장 stream 압축 해제 우회, 최종 원본 Contents 재파싱을 각각 주입했습니다. 다섯 실행 모두 컴파일 뒤 정확히 새 전체 연결 테스트에서 실패해 계층별 우회를 검출했습니다.

## 남은 범위

검증 대상은 `validateKnownCounts`가 정의한 알려진 리소스이며 unknown/extra payload 내부 참조의 의미까지 증명하지는 않습니다. 항목 추가·삭제와 DocInfo 수정, 암호화/DRM 쓰기, 외부 LINK, 여러 stream의 원자적 편집 세션, 공개 JS API는 별도 범위입니다.
