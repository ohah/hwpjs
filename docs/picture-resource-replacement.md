# 선택한 그림의 원시 이미지 교체

HWP5·HWPX의 기존 그림 한 개를 새 PNG 또는 JPEG로 교체하는 독립 파일 변환입니다. 새 그림 삽입이나 열린 편집 세션의 undo 명령이 아닙니다. 입력 원본은 보존하고 같은 형식의 새 파일을 만듭니다. 개발 후보의 기능이며 npm `@ohah/hwpjs@0.1.0`에 소급하지 않습니다.

## 선택과 공통 서비스

CLI의 `replace-image`, MCP의 `replace_document_image`는 `packages/cli/src/replace-image.ts`의 `replaceDocumentImage`를 공유합니다. 기본 내용 읽기·구조 보기에서 발급한 이미지 논리 참조를 전달합니다. 참조에는 원본 SHA256·형식·구역·그림 주소가 들어 있습니다. 오래된 SHA, 다른 형식·개체 종류, 이미지 inventory의 실제 멤버가 아닌 주소는 교체 전에 거부합니다. 표시 순번을 Native 주소로 추측하지 않습니다.

HWP5 공개 이미지 참조의 `node`는 `component_node`입니다. 공통 이미지 inventory가 확인한 `source.recordNode`, 즉 실제 `SHAPE_PICTURE` 레코드 주소를 Native 교체기에 전달합니다. HWPX는 inventory의 `source.pictureNode`를 사용합니다. 이 매핑을 파일 호스트·MCP에서 각각 재구현하지 않습니다.

서비스는 첫 비동기 작업 전에 문서·이미지·WASM 바이트를 소유 복사합니다. 공유 버퍼와 잘못된 바이트 입력은 거부합니다. 관측용 문서는 읽기에만 사용하며, 별도 WASM 인스턴스의 파일 변환 함수에 원본 스냅샷과 실제 그림 주소를 전달합니다. 결과를 반환하기 전에 관측 inventory·문서·변환기를 닫고, 작업과 정리가 함께 실패하면 두 원인을 보존합니다.

## Native와 자원 보존

- 공통 이미지 검사 `src/image/picture_input.zig`는 PNG 길이·청크 CRC와 JPEG 프레임 구조를 확인합니다. 픽셀 전체 디코딩이나 모든 렌더러에서의 표시 성공을 보장하지 않습니다. 파일 확장자로 형식을 판단하지 않습니다.
- HWP5는 새 BinData 항목·새 CFB 스트림을 추가하고 선택한 그림의 참조만 바꿉니다. DocInfo 순번과 물리 스트림 ID를 구분합니다. 기존 이미지와 이를 공유하는 다른 그림은 그대로 둡니다.
- HWPX는 새 manifest 항목·ZIP entry를 추가하고 선택한 그림의 이미지 참조만 바꿉니다. 기존 entry의 해제된 내용은 유지하지만 ZIP 압축 표현·오프셋까지 동일하다는 뜻은 아닙니다.
- 그림의 크기·배치·crop·효과와 미해석 속성은 유지합니다. 새 이미지에 맞춘 자동 비율 조정·재조판은 수행하지 않습니다. 미참조가 된 원래 이미지도 삭제하지 않습니다.
- HWP5의 서명 관련 헤더, HWPX의 알려진 XMLDSig·미지원 META-INF·추가 rootfile 등 지원하지 않는 보호 구조는 거부합니다. 모든 사설 서명 형식의 탐지·진위 검증·재서명을 제공하지 않습니다.

입력·출력 문서는 각각 최대 64MiB, 새 이미지는 최대 8MiB, JS의 WASM 입력은 최대 32MiB입니다. 이미지 관측은 기존 section-picture inventory의 4,096개 한도를 사용합니다. Native 파싱·압축 해제와 자원 이름 확인은 공통 파서·writer 및 Map·Set을 재사용하며, 그림마다 문서를 재저장하지 않습니다.

## ABI·호스트·보고

`picture_file_replace`는 형식 코드 1(HWP5) 또는 2(HWPX), 입력 포인터·길이, 구역·그림 레코드, 이미지 포인터·길이를 받습니다. `picture_file_replace_ptr`·`len`·`free`가 결과 소유권을 관리합니다. 실패 시 이전 출력은 노출하지 않으며, 이전 출력과 다음 입력이 같은 할당이어도 호출이 끝나기 전에는 해제하지 않습니다. `src/wasm/picture_file_replace_output.zig`가 이를 소유합니다.

JS 브리지는 `js/picture-resource-replacement.mjs`이며 구형 WASM에 새 진입점이 없으면 `PictureReplacementAbiUnavailable`로 거부합니다. 기존 편집기 객체나 세션 이력을 이 변환 결과로 덮어쓰지 않습니다.

파일을 읽고 쓰는 권한은 기존 `extended-host.ts`·`files.ts`가 소유합니다. 참조·이미지 입력·새 출력 경로를 확인한 뒤 Native를 호출하고 덮어쓰기 없는 게시를 수행합니다. 이미 게시된 뒤 stdout 기록이 실패하면 기존 게시 진단을 유지합니다. 반환·보고에는 원본 SHA256, 새 이미지 SHA256, 출력 SHA256과 `previewStale: true`가 포함됩니다. 기존 미리보기 이미지를 보존하므로 미리보기 캐시를 새 그림으로 재생성했다는 뜻이 아닙니다.

실행·검증 명령은 [개발·검증 명령](development-commands.md)이 소유합니다. 읽기·추출과 참조 문법은 [이미지 도구](cli-resource-tools.md), CLI 전체 지원 범위는 [편집 기능 계약](cli-editing-capabilities.md)을 따릅니다.

## 검증한 결과

격리 후보와 새 WASM `d4c9d5cd0e9d1e10031d8cc02def9ec80603129e9e6a8680bc4c5eac87007b49`에서 실제 Noori 두 형식의 PNG·JPEG 교체를 확인했습니다. 읽기에서 발급한 참조를 사용해 교체하고, 독립 CFB/ZIP/XML 검사로 선택 그림의 참조와 새 이미지 바이트만 바뀌며 원본 이미지와 다른 세 그림이 유지되는지 대조했습니다. 저장본을 다시 열어 추출한 이미지의 SHA256도 교체 입력과 일치했습니다. 원본 Noori에 공유 소비자가 존재한다는 뜻은 아니며 공유 리소스의 격리는 별도 Native 파생 문서 검사로 확인했습니다.

실제 CLI·공식 stdio MCP에서도 두 형식의 교체가 통과했습니다. 오래된 SHA·다른 개체 종류·손상 이미지·용량 초과·구형 WASM·기존 출력은 새 파일을 게시하지 않았습니다. Native에서는 암호화·서명 경로, 잘못된 대상, 반복 교체, 출력 할당 별칭, 모든 할당 실패와 복구를 확인했습니다. 과거 임시 경로를 제거한 최종 Native 검사는 저장소의 공식 Noori 상대경로를 사용합니다.

새 WASM을 기본 인접 파일로 포함한 비공개 로컬 패키지도 설치했습니다. 별도 WASM 경로 지정 없이 도움말·두 형식 읽기·PNG 교체·재열기와 MCP 초기화·도구 조회·읽기가 통과했습니다. 이 로컬 설치 후보와 CI용 Native820 Skill 자산은 별개이며, npm 0.1.0의 기능이 바뀌거나 새 버전을 공개한 것은 아닙니다. 브라우저의 실제 그림 표시·미리보기 재생성·열린 세션의 undo는 이번 검증 범위에 포함하지 않습니다.
