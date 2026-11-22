# HWP5 기존 그림의 원본 자르기 후보

기준은 7bec628a6a1707ac6e24bb7f64661dc8fb294231이다. 기존 삽입 계약은 hwp5-image-source-crop.md가 소유한다. 이 문서는 새 Native 소스 후보의 경계이며 실행·배포 완료 주장이 아니다.

## 대상과 좌표

Session.pictureCrop({section,picture_node})로 현재 물리 picture/control/component/문단/앵커를 조회한다. Command.set_picture_crop은 {before,rect}를 받는다. before는 원본 구역 SHA256, 내부 리소스 ordinal/SHA256, 정확 버전, 현재 history ticket과 source rectangle/extent를 묶는다. instance ID만으로 대상을 찾거나 표시 좌표로 문단을 추정하지 않는다.

rect는 named left/top/right/bottom이며 HWP5 raw INT32 저장 순서도 같다. source 좌표이며 표시 HWPUNIT 크기나 bitmap 픽셀 수가 아니다. 공통 picture_crop_rectangle.Rectangle.fits를 그대로 공유하되 HWP5의 i32 인코딩 제한은 유지한다. 전체 범위 또는 한 단위 폭도 허용하며 음수·역전·면적0·원본 초과를 거부한다. clamp·리사이즈·좌표 재해석을 하지 않는다.

5.0.3.0은 명시 effects-only tail, 5.0.3.4/5.0.5.0은 명시 dimensions8 tail만 선택한다. tail 완전 소비와 effects flags0을 요구한다. 명시 원본 크기 쌍이 양수일 때만 그 좌표계를 사용한다. 완전 부재는 기존 구조 검사기가 읽은 PNG/JPEG dimensions와 기존75단위 host 정책을 사용한다. 75를 공식 명세의 보편적 픽셀 상수로 해석하지 않는다. 명시0/부분/미지 tail은 부재로 바꾸지 않는다. 5.1은 별도 typed profile 검증 전까지 거부한다.

PNG eXIf/APNG 및 JPEG APP1은 첫 프로필에서 거부한다. 이것은 EXIF가 모두 회전이라는 판정이 아니다. 단일 wellformed EXIF Orientation1과 일관된 XMP 정책은 기존 exif_tiff/marker inspector를 사용하는 별도 후속이다. 원본 픽셀 전체 디코딩·DPI·EXIF 변환·한컴 화면 동치는 증명하지 않는다.

## 보존과 거부

최상위 본문에 속한 단일 그림의 정확한 현재 control anchor와 field fence를 사용한다. inline/floating 자체를 바꾸지 않는다. 그룹·중첩 셀/도형·캡션·회전/flip·비대각/비양수 transform·상대 크기·sizeProtected·읽기 전용·보호 field를 거부한다. field fence는 기존 picture_replacement_current.validateOwner를 재사용한다. 새 범용 lock bit를 만들거나 기존 가드를 완화하지 않는다.

writer는 검증 후 구역을 복제하고 tag85 payload offset44의16바이트만 바꾼다. BinData/DocInfo/불투명 tail/테두리/quad/control/component/display geometry는 그대로다. publishFixedSection.keep으로 pending current-size/matrix intent와 다른 모델 값을 보존한다. source cache를 새 표시 기하로 굽지 않는다.

관리 HistoryV2 단일 거래만 허용한다. stale/변조/외부 세션과 정상 no-op은 capacity 준비 전에 판정한다. direct Session/V1/혼합 batch는 거부한다. 저장은 기존 경로를 사용하며 기본 LayoutReflowRequired를 완화하지 않는다. focused 시험의 allow_stale_layout은 명시 보존 저장 증거이며 기본 엄격 저장 성공이 아니다.

## 준비 시험과 남은 경계

functional probe는 신규9개, 기존 삽입 source-crop6개, 공통 rectangle2개를 선택한다. own blank factory와 승인 own64x32 PNG/JPEG, SHA6b201022의 공개 picture-resize를 사용한다. 독립 raw record walk가16바이트만 바뀌고 다른 picture/stream이 그대로인지 검사한다. 전체 저장 바이트의 undo/redo와 재열기, 변조/foreign/replay/no-op/invalid/V1/protection/pending-size/exhausted-counter 시험을 준비했다.

별도 OOM probe2개는 정상 성공 control과 일반/NoResize 전 할당 실패를 준비한다. fault는 mutation 시작에만 주입하고 사후 저장/redo oracle 전에 해제한다. 실패 뒤 원본/redo/revision 및 세션 해제 후 per-trial allocated/freed를 검사한다. 준비만으로 실행 성공을 뜻하지 않는다.

공개 paired sample-5017-pics/latex는 5.1.0.1이며 현재 프로필 밖이다. sample의 명시 원본0도 raster extent로 바꾸지 않는다. 실제 query 허용 이전에11그림 보존 성공을 주장하지 않는다. Noori의 APP1, BMP 리소스, 표/캡션/transform 자격도 실제 query와 별도 후속으로 분류한다.

현재 optional ABI/JS/Core/Worker/UI는 이 Native 패치에 포함하지 않는다. 합의된 후속 optional4의 wire basis는 original_dimensions를 explicit_pair, raster_96dpi를 absent_75_policy로 명시 매핑한다. Native full witness는 내부에 유지한다.
