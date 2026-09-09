# JFIF RGB 샘플 조립

## 범위와 근거

[ITU-T T.871](https://www.itu.int/rec/T-REC-T.871-201105-I/en) 6.1~6.2의 8비트 1/3성분, 7절 색 좌표, 8절 위에서 아래로의 행 순서, 9절 성분 위치를 기존 구현과 연결합니다. [샘플 평면](jpeg-sample-planes.md), [중심 정렬 업샘플링](jpeg-upsampling.md), [JFIF 색 변환](jpeg-jfif-colour.md)의 공식과 경계 규칙은 각 기존 모듈이 소유합니다. 이 연결 계층에 계수·IDCT·보간식을 다시 구현하지 않습니다.

출력은 JFIF로 명시적으로 해석한 RGB 샘플입니다. 색 관리된 sRGB·화면 렌더링·한글 프로그램과의 픽셀 동일성·모든 JPEG 프로세스 지원을 뜻하지 않습니다. 제품 JS API와 HWP BinData 이미지 검사에는 아직 연결하지 않았습니다.

후속 [progressive JFIF RGB](jpeg-progressive-rgb.md)는 별도 명시적 진입점으로 제공하며 메타데이터 준비/렌더링과 기존 Image 타입을 공유합니다. 이 문서의 기존 decode는 계속 순차 전용입니다.

## 책임과 API

- `rgb_raster.zig`: 빌린 sample_planes.Image를 받아 소유권 있는 packed RGB를 생성합니다. 호출자가 gray/rgb/ycbcr 해석과 nearest/bilinear 방법을 반드시 지정합니다. 성분 ID나 값에서 색을 추측하지 않습니다. 8비트 정밀도·성분 수·각 평면 크기/길이·0~255 샘플을 확인하며, u32 extent를 검사한 뒤 u16 축으로 전달합니다. 출력은 행 우선 RGBRGB 순서이고 반전이나 aspect 보정은 하지 않습니다.
- `jfif_adobe.zig`: JFIF 해석을 선택한 경우에만 적용하는 보수적인 충돌 정책입니다. 3성분은 Adobe transform 1, gray는 transform 0만 허용하고 모든 헤더를 확인합니다. 뒤의 정상 헤더가 앞의 충돌을 덮지 않습니다. 미지 transform은 별도 미지원 오류입니다. Adobe 버전/flags 의미 인증이나 T.872의 인쇄용 식별자 검사로 대체하지 않습니다.
- `jfif_render.zig`: 순차/progressive 공통 JFIF 전체 배치 검사 → 출력 크기 사전 검사 → Adobe 전체 순회 → ICC 조각 재조립의 준비 단계와, 샘플 이후의 Adobe 충돌 검사 → RGB 조립을 소유합니다. Image와 렌더링 기본 한도도 공유합니다.
- `jfif_rgb.zig`: 위 공통 준비와 렌더링 사이에 순차 샘플 복원을 호출합니다. 구조 순회는 여러 번 수행하지만 마커 파서를 복제하지 않습니다. 색 해석은 API 이름이 지정하는 JFIF이며 일반 JPEG 자동 판별기는 아닙니다.

`jfif_rgb.Options`는 `upsampling`과 `colour_management = .unmanaged`가 필수입니다. 출력은 자체 RGB 버퍼와 scalar 진단만 소유하므로 JPEG 입력을 해제해도 유효합니다. Image.deinit으로 해제합니다. 임시 ICC 바이트는 준비 단계에서 조각 수를 복사한 뒤 해제하며 Adobe descriptor·샘플 평면도 성공/실패 모두 정리합니다.

`metadata_deferred`는 항상 true입니다. ICC는 조각 연결만 확인하고 내부 프로파일 유효성·CMM은 확인하지 않습니다. 예를 들어 번호가 완비된 3바이트 ICC 내용도 unmanaged 출력은 만들 수 있지만 유효 프로파일로 인증하지 않습니다. Exif orientation·다른 APP 의미·Adobe flags·미지 JFXX·압축 썸네일 의미도 완료로 보고하지 않습니다. JFIF 버전·Adobe 개수·ICC 조각 수·기타 APP 수·미검사 압축 썸네일·미지 확장 개수를 별도로 반환합니다. orientation·density 보정은 RGB 바이트에 적용하지 않습니다.

기존 순차 decode는 progressive 및 그 밖의 미지원 엔트로피를 오류로 반환하며 썸네일이나 미리보기로 대체하지 않습니다. 순차 디코더의 마지막 EOI·성분 coverage·엔트로피 padding 검사를 통과한 뒤에만 출력합니다. trailing 정책은 기존 structure 옵션을 따릅니다.

## 자원 경계

`requiredBytes`가 width × height × 3을 u64로 계산하고 0 크기·호스트 usize·RGB 예산을 검사합니다. 파일 진입점에서도 픽셀 할당 전에 이 검사를 호출합니다. 기본 RGB 예산 192,000,000바이트, 평면 샘플 예산 64,000,000개(u16), ICC 예산 16,707,345바이트, Adobe 헤더 256개는 서로 독립적입니다. 이들 합계가 하나의 전체 메모리 예산으로 제한된다는 뜻은 아닙니다. 기존 프레임/마커/블록 제한도 유지합니다.

## 검증 기록

네이티브 JPEG RGB 필터는 root 집계 포함 7/7개가 통과했습니다. 직사각 평면 interleave, 직접 RGB/gray/YCbCr 경로, 입력 변경 후 출력 소유권, 모든 할당 실패, u32 초과 extent, 잘못된 샘플/길이/성분 수/정밀도, RGB 및 ICC/평면 예산, 늦은 Adobe 충돌·잘림·잘못된 엔트로피를 포함합니다.

테스트용 mode 277은 명시적 encoding·보간 방법과 평면 wire를 받아 RGB로 조립합니다. mode 278은 unmanaged JFIF 전체 파일을 받아 RGB와 진단 필드를 반환합니다. 제품 ABI가 아닙니다. `jpeg-rgb.mjs`는 독립 평면 복원·보간·색 변환 기준식을 재사용하되 성분별 전체 확장 후 별도 interleave를 수행하여 제품의 픽셀별 접근과 구분합니다.

Debug/ReleaseSafe 독립 WASM에서 각각 비교 323건·오류 거부 734건, 출력 88바이트 개별 XOR 1 변조 검출을 통과했습니다. 홀수 크기·비대칭 샘플링·분리 스캔·restart·DNL·테이블 재정의, 65,535×1 및 1×65,535, 마지막 ICC 조각 누락, 서로 다른 Adobe 헤더 순서 및 미지 값도 검사합니다.

Debug 실 HWP JPEG 참조 8건 중 순차 7건은 두 보간 방식 모두 독립 RGB 결과와 일치했고 progressive 1건은 정확한 UnsupportedJpegSequentialProcess 오류를 확인했습니다. 별도 s1.jpg는 방식당 24,928픽셀을 대조했습니다. 실제 한글/브라우저/libjpeg 화면 캡처와의 대조가 아니며 고유 이미지 수로 해석하지 않습니다.

`/tmp/hwpjs-jpeg-rgb-mutants.Kd2Df0/` 격리 소스의 색 변환 생략·Adobe 충돌 연결 제거·보류 false·RGB 예산 무력화는 세 모드 모두 컴파일 후 테스트 실패로 검출했습니다. 각 필터 7개 중 실패는 순서대로 1/1/1/2개였습니다. 제품 소스에는 이 변형을 적용하지 않았습니다.

ReleaseFast 독립 WASM에서도 비교 323건·거부 734건 및 출력 88바이트 변조 검출이 통과했습니다. 실 HWP 8참조와 s1.jpg 대조도 ReleaseSafe/ReleaseFast에서 동일하게 통과했습니다. 새 네이티브 필터 7/7개는 세 모드 모두 통과했습니다.

Debug → ReleaseSafe → ReleaseFast 순서의 전체 회귀가 모두 20/20단계·837/837 네이티브 테스트·checks 7,794,190건으로 통과했습니다. 로그는 `/tmp/hwpjs-jpeg-rgb-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 전체 회귀 후 최종 네이티브 837/837개와 제품 ReleaseSafe 빌드 5/5단계도 통과했습니다. 검사 수는 전체 HWP/JPEG 지원률이나 한글과의 픽셀 일치 보장이 아닙니다.
