# HWP5 BinData BMP RLE RGBA 검사

## 연결 계약

기존 [BMP 선택 검사](hwp5-bin-data-bmp.md)의 bmp 옵션에 [RLE RGBA 옵션](bmp-rle-rgba.md)을 명시적으로 전달하면 내부 BMP의 RLE4/8을 검사합니다. BinData 표 17~18의 항목별 압축·경로 정책을 재사용하며, LINK를 실행하거나 실패한 압축/이미지를 원본/빈 성공으로 바꾸지 않습니다. PNG/JPEG/BMP 형식 선택 순서는 변경하지 않았습니다.

기본 rle=null은 기존 동작입니다. 선택 시 raster의 명령·패딩·완료·후행·색인 예산과 RGBA 채움 정책을 그대로 전달합니다. HWP 전역 max_total_bmp_rgba_bytes의 남은 양과 개별 max_rgba_bytes 중 작은 값을 적용하고, 이 RGBA 예산은 RLE 색인 평면을 할당하기 전에 확인합니다. PNG/JPEG 예산을 대신 차감하지 않습니다. 동일 물리 스트림의 반복 참조도 각각 집계합니다.

`container/bmp_images.zig`는 기존 scalar 네 항목에 rle_images, rle_written_pixels, rle_unwritten_pixels, rle_commands, rle_consumed_bytes, rle_trailing_bytes, rle_palette_zero_pixels, rle_transparent_pixels의 여덟 항목을 추가합니다. 비압축에서는 모두 0이고, 채움이 발생해도 원래 미지정 픽셀 수는 유지합니다. 두 채움 통계는 실제 미지정 픽셀에 적용한 정책만 세며 원래 색인 0의 픽셀을 세지 않습니다.

공통 BMP Report.plus의 checked 가산과 images.Budget의 임시 보고서 교체 규칙을 재사용합니다. 새 통계 overflow나 픽셀 오류가 나면 이전 보고서를 유지합니다. 이미지/색인/CFB 버퍼는 반환 전에 해제하고 보고서는 포인터를 보유하지 않습니다. metadata_deferred와 semantics_deferred는 유지합니다. 제품 JS API는 아직 CFB 전용입니다.

## 테스트 보고서와 독립 검증

기존 mode 288은 새 필드가 생겨도 원래 네 BMP 통계만 직렬화하도록 고정했습니다. 새 mode 291은 기존 BMP 옵션 26바이트 뒤 RLE 선택 17바이트, 문서 한도 u32와 CFB를 받습니다. 출력은 기존 이미지 확장 120바이트 뒤 RLE 선택 및 여덟 통계 36바이트를 더해 확장 156바이트입니다. 제품 ABI가 아니며 기존 문서/이미지 wire를 바꾸지 않습니다.

선택 입력은 standalone RGBA와 공유하고, 독립 JS의 PNG/JPEG 우선순위 이후 BMP 항목 선택은 기존 BMP helper와 공유합니다. 기대 보고서는 제품 Report의 필드 reflection에서 만들지 않고 고정 순서와 독립 픽셀 oracle로 계산합니다. BMP를 끈 기존 보고서에서 처리한 BMP 수만 unhandled에서 빼고 다른 문서/PNG/JPEG 결과는 유지되는지 확인합니다.

네이티브는 반복 참조에서 transparent/palette_zero 혼합 집계·남은 RGBA 예산·개별 색인 한도·fill/completion 거부·새 카운터 overflow·CFB 해제 이후 수명과 모든 할당 실패를 검사했습니다. 기존 RLE/새 RGBA를 합친 필터는 세 모드 각각 19/19개입니다.

세 모드 직접 WASM에서 생성 HWP의 압축/비압축×1/2/5회 참조, RLE4/8×두 채움, 완전 지정 이미지의 세 채움 정책, 확장자 불일치·선택 꺼짐·한도-1·짧은 선택 입력을 대조했습니다. 후행 정책 조합 보강 이후 각 모드 비교 65건·거부 228건을 통과했습니다. 두 비트 깊이×두 채움의 확장 보고서 총 624바이트를 각각 XOR 1로 바꿔 모두 검출했습니다.

일반 HWP 45개에서는 세 모드 각각 기존 BMP 2참조·RGBA 482,080바이트·불일치 0·메타데이터 보류 2를 유지했고 새 RLE 통계는 모두 0이었습니다. 기존 정책으로 배포용 2/암호화 1개를 제외했습니다. 별도 `reference/rhwp/samples/3-09월_교육_통합_2022.hwp`는 BMP 26참조·RGBA 114,758,724바이트를 유지하고 RLE 통계는 모두 0입니다. 이 추가 문서에는 명시적 128 MiB 문서 한도를 사용했습니다. RLE가 없는 실제 문서에서 새 선택이 결과를 바꾸지 않았다는 증거이며, 실제 RLE 저장 표본 검증은 아닙니다. 이 연결 대조는 정규 containerActual에도 넣었습니다.

첫 임시 실파일 집계 스크립트가 이전 네 필드 배열을 사용해 추가 통계에 NaN을 출력했습니다. 각 문서의 제품/독립 보고서 대조는 통과했지만 그 합계는 근거로 사용하지 않았습니다. 임시 집계 배열을 12개로 수정하고 세 모드 모두 다시 실행하여 위 결과를 확인했습니다. 제품 코드나 정규 oracle을 이 집계 문제에 맞춰 바꾸지 않았습니다.

소스 결함 주입과 전체 회귀 결과는 RGBA 주제 문서에서 관리합니다. 전체 문서 의미·레이아웃·색 관리 지원을 선언하지 않습니다.

## 후행 정책 입력 도구의 독립성 보강

첫 전체 Debug 회귀 중 JS 입력 생성기가 trailing 옵션 하나를 BMP 파일 뒤 허용 비트와 RLE EOB 뒤 허용 비트에 함께 전달하는 것을 발견했습니다. rle trailing만 요청해도 입력의 두 비트가 모두 1이 되는 실제 출력으로 재현했습니다. 제품의 두 옵션은 원래 별개이며, 테스트 도구가 독립적으로 선택하지 못하는 문제였습니다.

실행 중인 정확한 Debug audit/build 프로세스를 종료하고 shell 코드 143 및 남은 해당 프로세스 부재를 확인한 뒤 수정했습니다. 새 helper의 fileTrailing은 기존 BMP 파일 플래그, trailing은 RLE 플래그만 소유합니다. 독립 oracle은 외부 파일 범위를 먼저 검사한 뒤 그 안의 압축 구간을 읽습니다. 파일/RLE 꼬리 존재×두 허용 플래그의 16조합(성공 9/거부 7)을 추가했고 세 모드 모두 통과했습니다.

호출 직전 두 플래그를 다시 결합하는 입력 변형은 세 모드 모두 AssertionError로 검출했습니다. 첫 전체 로그는 유지하고 수정된 테스트로 전체 회귀를 처음부터 다시 실행해 세 모드 모두 통과했습니다. 제품/네이티브 테스트는 이 도구 보강에서 변경하지 않았습니다.
