# HWPX 새 그림의 소스 crop과 표시 크기

새 삽입 생성기만 바꾸는 후보다. 기존 문서 reader·그림 교체·HWP5 writer·공개 ABI는 변경하지 않는다. 실제 Native·WASM·SDK·브라우저 실행은 이 문서 작성 시점에 미실행이다.

r5의 PNG64×32는 표시7200×3600과 동일한 imgClip을 생성해 기존 renderer에 source96×48을 요청했다. 작은 표시2400×1200에서는 source32×16만 요청하므로 원본의 왼쪽 위 일부만 보인다. 원본과 표시 크기가 같은 기존 테스트는 이 두 경우를 구분하지 못했다.

`image_insertion_xml.create`는 검사된 PNG/JPEG 픽셀 크기를 별도 인자로 받는다. 새 삽입의 imgClip만 픽셀 크기×75로 생성한다. 이는 현재 no-imgDim renderer의 명시적 단위 계약7200/96이며 HWP5 버전 정책이나 OWPML 전체에 대한 보편적 DPI 규정이 아니다. 0·signed32 범위 초과는 오류이며 clamp하지 않는다. 픽셀 검사·이미지 예산은 기존 구조 검사기를 사용한다. EXIF로 회전된 JPEG 및 모든 디코더 변형까지 검증한 것으로 주장하지 않는다.

orgSz/curSz는 도형 원본·현재 크기이며 imgDim의 원본 그림 기준 크기와 다른 필드다. 현 생성기의 orgSz/curSz/imgRect/sz와 항등 행렬은 표시 크기 기준인 기존 값을 유지한다. imgClip은 래스터 source 범위만 소유한다. 기존 reader는 crop을 orgSz/curSz에서 추정하지 않고 직접 imgClip과 선택적 imgDim을 독립적으로 읽는다. 새 생성의 imgDim 부재를 유지하며, 기존 문서의 부재·0·명시 값은 수정하지 않는다.

로컬 공식 문서 전사본의 부록 E는 AbstractShapeComponentType의 orgSz/curSz와 PictureType의 imgClip/imgDim을 별도 요소로 선언한다. 해당 전사본 imgDim에는 minOccurs=0이 없으므로 생성 프로필의 부재를 전체 XSD 적합성으로 부르지 않는다. 현재 제품의 부재 처리와 기존 표본 계약을 보존하는 좁은 수정이다. 75 환산이나 생성 XML 전체 순서의 규범 적합성을 해당 스키마만으로 확정하지 않는다. 타 구현 코드·블로그·비교 구현 알고리즘은 수정 근거로 사용하지 않는다.

새 Native 집중 진입점은 `zig build test-hwpx-image-source-crop -Doptimize=ReleaseSafe -j1 --summary all`이다. PNG/JPEG 각각 표시가 원본보다 큰 경우와 작은 경우에 실제 Session/History 삽입→기본 저장→ZIP/XML raw crop/shape/resource 대조→새 세션 재열기→undo/redo 바이트 동치를 검사하도록 작성했다. 독립 파일 변환과 경계 거부, 기존 XML 생성3·live image8·HWP5 chart5도 같은 집중 등록에 포함한다. 실행 승인은 별도다.

`tests/image/hwpx-source-crop-rendering.test.mjs`는 기존 실제 painter의 drawImage 인자를 mock context에서 확인한다. r5의 큰 source 오류, 작은 source의 부분 이미지, 후보의 확대·축소·비등방 표시, 기존 명시 imgDim 부분 crop을 구별한다. Canvas 픽셀·저장 파일 실제 브라우저 검증을 대신하지 않는다.
