# HWPX fillBrush 이미지 바이트 검사

`src/hwpx/fill_brush_image_payloads.zig`는 [이미지 OPF 연결](hwpx-fill-brush-image-links.md)이 embedded로 확인한 manifest 항목만 ZIP에서 읽습니다. ZIP/형식/한도 판정은 [그림 이미지 검사](hwpx-picture-image-payloads.md)도 재사용하는 `image_payloads.zig` 한 곳이 소유하고 브러시 모듈은 출처 보고서를 전달합니다. OPF 항목 인덱스와 ZIP 엔트리 인덱스뿐 아니라 실제 ZIP 경로가 manifest `href`와 같은지도 확인합니다. 항목별로 한 번 해제하며 ZIP 길이·CRC는 기존 `Archive.decode`가 검사합니다. 다른 출처의 참조가 같은 항목을 가리키면 `Target.references`만 증가합니다. `Document.inspectKnown()`은 header·section과 마스터페이지의 원값·링크·바이트 보고서를 각각 소유합니다. 외부·부재·빈 값·미해결 ID는 네트워크/파일에 접근하지 않으며, 원래의 링크 상태를 보존하고 `non_embedded_sites`에 셉니다.

형식은 OPF `media-type`이나 파일 확장자가 아닌 바이트 시그니처로 고릅니다. PNG는 공통 PNG 픽셀/스캔라인 검사, JPEG는 공통 JPEG 마커·엔트로피 **경계** 검사, BMP는 공통 BMP 파일·DIB·픽셀 영역 **구조** 검사, GIF는 공통 GIF 프레임 인덱스 복호화를 적용합니다. WMF·TIFF·PCX로 판별된 바이트의 framing·구조·RLE 경계는 [공통 이미지 검사 계약](hwpx-picture-image-payloads.md)이 소유합니다. 각 `Target.inspection`이 시도한 깊이를 명시하고 `inspection_error`는 실제 실패 이유를 별도로 보존합니다. 알 수 없는 형식은 `unknown_formats`로 남기고 유효한 이미지로 세지 않습니다. JPEG 계수/색상 복원과 BMP 픽셀 복호화, GIF 합성/색 관리, WMF 그리기 의미·TIFF 픽셀·PCX 색상·이미지 렌더링은 아직 완료되지 않았습니다.

`media_matches`는 알려진 형식과 선언된 media-type의 정확한 대응만 표시합니다. 시그니처를 모르는 형식은 `null`로 남겨 MIME 판정 불가와 실제 불일치(false)를 구분합니다. JPEG의 `image/jpeg`와 실파일에 관측된 `image/jpg`를 모두 대응으로 인정하지만 원문을 바꾸지 않습니다. 선언/바이트가 달라도 실제 형식 검사 결과를 버리거나 묵시적으로 교정하지 않으며 판별 가능한 형식의 불일치만 `media_mismatches`로 진단합니다. 화면 표시·저장 단계의 출력 MIME 정책을 여기서 추정하지 않습니다.

`max_targets`, `max_entry_bytes`, `max_total_encoded_bytes`와 PNG 해제 스캔라인 바이트·GIF 인덱스/코드/프레임의 누적 한도는 각 보고서에 별도로 적용됩니다. `encoded_bytes`는 고유 manifest 항목의 해제된 바이트 합계이며 ZIP 해제 결과는 즉시 `archive.allocator`로 반환합니다. 보고서는 출처 사이트 인덱스와 항목/ZIP 인덱스 및 스칼라 결과만 소유하므로 원본 문서가 해제되면 ID·경로는 역참조할 수 없습니다. 검사에 실패하면 이전 보고서와 임시 버퍼를 모두 정리합니다.

ZIP 길이·CRC, 메모리 부족, 호출자가 정한 한도 오류는 함수 오류로 전파합니다. 형식 내부 검사 오류는 `Target.inspection_error`와 `inspection_failures`에 기록하고 나머지 문서를 계속 조사합니다. `inspectKnown()` 성공은 이 값이 0이라는 뜻이 아닙니다. 미지원 JPEG/BMP 변형도 검사 오류에 섞일 수 있으므로 실패 원인을 함께 봐야 하며, 이를 모두 파일 손상으로 단정하지 않습니다.

## 실측과 남은 범위

독립 `tools/hwpx-fill-brush-image-oracle.py --payloads`는 선택 ZIP/OPF/XML의 직접 `fillBrush → imgBrush → img`만 세고, ZIP 바이트 시그니처와 OPF 선언을 별도로 대조합니다. 로컬 HWPX 484개 중 ZIP 거부 6개·암호화 2개를 제외한 476개 문서에서 이미지 참조 390건, 고유 내장 manifest 항목 388개, 총 해제 바이트 8,631,009개를 관측했습니다. 고유 대상은 JPEG 365, PNG 21, BMP 1, GIF 1개입니다. PNG 바이트 7개는 OPF에 `image/jpg`로 선언돼 있어 불일치로 남깁니다. `issue6192/cell_behind_text_para_anchor.hwpx`의 PNG 8개는 ZIP CRC는 맞지만 IDAT 내부 CRC가 각각 틀리고 IEND도 완전하지 않습니다. 이를 문서 전체 거부로 숨기지 않고 각각 `InvalidChecksum` 진단으로 남깁니다. 선택 마스터페이지 61개에는 이미지 브러시 참조가 없어 해당 경로의 실파일 양성 검증은 없습니다. 이 표본 분포를 모든 HWPX 버전·파일의 형식 목록으로 일반화하지 않습니다.

전용 검사는 중복 참조, MIME 불일치, 미지원 바이트, 외부/빈/부재/미해결 참조 건너뛰기, 정확한 개수/바이트 한도, ZIP CRC가 정상인 안쪽 PNG 체크섬 오류, 서로 다른 보고서/ZIP 할당자, 모든 할당 실패, 추적 실파일 `borderfill.hwpx`의 3참조/1대상과 늦은 단계 오류 정리를 다룹니다. 내장 PNG 마스터페이지 합성 문서는 기존 스트리밍 이진 참조 0건과 원값 이미지 대상 1건의 범위 차이 및 바이트 검사까지 확인합니다. 실파일 shard와 전체 회귀의 재현 명령은 [개발·검증 명령](development-commands.md)에 기록합니다. 이 검사는 브러시 이외의 picture/OLE 항목, OPF 밖 바이너리, 외부 URL, 전체 이미지 디코딩, 전체 XSD/문서 모델, 편집·저장 완료 판정이 아닙니다.

2026-09-25 최종 소스의 독립 oracle 자체 반례·형식/PNG 체크섬 조사와 선택 실파일 8개 ReleaseFast shard가 통과했습니다. shard 2의 검사 실패 8건 및 shard 7의 MIME 불일치 7건을 별도 진단으로 대조했고, 나머지 shard에서는 두 값이 0건이었습니다. 전용 Zig 테스트는 Debug·ReleaseSafe·ReleaseFast에서 각각 9/9, 마스터페이지 내장 PNG 통합 테스트는 Debug 2/2로 통과했습니다. 전체 Debug `zig build test --summary all`은 5/5 단계·2,441/2,441 테스트, ReleaseSafe 제품 빌드·CFB 비교·audit도 종료 코드 0입니다.

적대적 재검토에서는 처음에 모든 `img`를 세어 브러시 밖 그림을 잘못 포함한 조사 범위를 직접 `fillBrush/imgBrush/img`로 바로잡았습니다. `borderfill.hwpx`도 처음의 1참조 가정 대신 실제 3참조/1대상을 확인했습니다. 실파일의 내부 CRC 오류를 만나 문서 전체를 거부하던 초기 구현은 ZIP 실패와 형식 내부 진단을 분리해 수정했습니다. 직접 검사기 호출 시 조작된 manifest 인덱스가 다른 ZIP 경로를 가리키는 반례도 거부합니다. 알려진 형식의 `inspection_error`, 시그니처를 알 수 없는 `unknown_formats`, 선언과 바이트가 다른 `media_mismatches`를 별개로 남기며, 자원 한도·할당 실패는 진단으로 삼키지 않고 오류로 전파합니다.
