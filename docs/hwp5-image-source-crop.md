# HWP5 신규 그림의 원본 crop과 표시 크기

이 문서는 HWP5 신규 그림 삽입의 표시 크기와 원본 crop 계약을 설명한다. 처음 문제를 관측한 소스는 `616f3e3a`다.

## 원인과 두 좌표

확인된 입력은 own64×32 PNG, 표시 요청은7200×3600HWPUNIT(25.4×12.7mm)다. 기존 writer는 표시 사각형을 crop에도 기록했다.5.0.3.0의 `effects_only`에는 원본 크기 꼬리가 없어 기존 reader가75단위/픽셀로 매핑한다. 따라서 source96×48을 bitmap64×32에서 읽고 destination96×48에 그리려 했다. 브라우저는 bitmap 교차 영역만 그려 실제64×32가 보였다. 원래 실패 로그와 그림은 보존한다.

후보는 표시 control/component/quad7200×3600을 유지하고, 구조 검사기가 읽은 원본 raster64×32로 source crop4800×2400을 만든다. Native raw 순서는 left/top/right/bottom=`[0,0,4800,2400]`, JS clip 순서는 left/right/top/bottom=`[0,4800,0,2400]`이다. 기존 painter에서 source64×32→destination96×48이 된다. reader/painter에 clamp·fallback·자동 재해석을 추가하지 않는다. 기존 문서의 crop·버전·geometry를 보정하지 않는다.

##75의 근거와 한계

공식 표107은 자르기 사각형의 INT32 필드를, 표116은 최초 이미지 크기의 HWPUNIT 필드를 설명한다. 이 표가75를 보편적인 이미지 픽셀 상수로 규정한다고 해석하지 않는다. 현재 own 호스트의 `hwpUnitPixels(v)=v*96/7200`과 부재 reference 정책 `unitsPerPixel:75`가 명시한96DPI 기준을 신규 파일의 원본 좌표에 일관되게 적용한다.

PNG는 기존 IHDR 검사 결과, JPEG는 기존 frame/DNL 구조 검사 결과의 width/effective_height를 사용한다. 새 헤더 parser나 픽셀 decoder는 만들지 않는다. `inspectImage`의 media 반환 계약과8MiB/기존 구조 검사 한도는 유지하고, 신규 작성용 `inspectRaster`가 pixel dimensions를 별도로 제공한다. source pixels×75가 signed INT32에 들어가지 않거나0이면 거부하며 clamp하지 않는다. 표시 폭·높이는 별도로 기존 정수/i32 한도를 따른다.

이 좌표 선택은 임베드된 DPI·EXIF를 화면 기하의 권위로 바꾸는 기능이 아니다. 회전 EXIF로 encoded frame과 브라우저 bitmap 크기가 바뀌는 경우와 모든 JPEG 변형의 시각 동치는 아직 검증 범위 밖이다.

## 버전과 저장

현재 own reader의 명시 배치에 맞춰 새 그림 writer만 다음 표를 사용한다. 표의 버전별 배치는 기존 제품의 선택 계약이며 공식 표116만으로 이 버전 경계를 도출한 것은 아니다.

| 버전            | 새 payload            | 원본 크기/alpha                   |
| --------------- | --------------------- | --------------------------------- |
| 5.0.3.0         | 82바이트/effects_only | 크기·alpha 부재 유지              |
| 5.0.3.4,5.0.5.0 | 90바이트/dimensions8  | 원본4800×2400HWPUNIT,alpha 부재   |
| 5.1.0.1,5.1.1.0 | 91바이트/with_alpha9  | 원본4800×2400HWPUNIT,명시 투명도0 |

모든 경우 crop은 독립 source 사각형이다. 원본 크기가 있으면 기존 reader가 명시 reference로 전체 bitmap에 대응시키고, 없으면 기존75 기준을 사용한다. 미지/인접 버전은 새 작성에서 거부한다. 파일 버전을 올리거나 추가 필드 부재를0으로 채우지 않는다. 현재 live Session의5.1 이상 거부는 그대로이므로 표의5.1 행은 기존 독립 파일 변환 writer에만 적용될 수 있다. 이것은 live 지원 확대나 모든 기존5.1 문서의 생성 검증이 아니다. 승인 Noori의 header는5.0.3.0임을 독립 메타데이터로 확인했다.

현재 Session/History와 독립 파일 변환 모두 같은 inspector와 writer에 연결한다. live request/ABI에 pixel·version 입력을 추가하지 않는다. 파일 버전은 Source가 소유한 author 내부 문맥으로 전달한다. 공통 차트 writer와 parser는 변경하지 않는다. 파일 저장 후 verifier도 새 crop·tail과 요청 display geometry를 기존 raw reader로 대조하도록 강화한다.

본문/필드/보호·범위·현재 owner·source binding·History·undo/redo 계약, blank factory, strict 측정 범위와 기본 `LayoutReflowRequired` 가드는 유지한다. 저장 시험의 명시 stale 직렬화가 일반 기본 저장 허용이나 그림 strict 재조판 완료를 뜻하지 않는다.

## 검증 구분

실제 JS renderer 계약8개는 기존 r4 source 초과와 제안 full-source 범위, 기존5개 version profile, 다른 명시 reference의 보존을 확인한다. 실제 `paintInlinePicture`의 drawImage 인자를 검사한 Node 시험이며 실제 브라우저 래스터·새 Native 산출물의 증거가 아니다.

`hwp5_image_source_crop_tests.zig`의6개는 구조 검사 PNG/JPEG dimensions,5개 tail raw layout, source 한도/미지 버전 거부, PNG/JPEG Session·History 실제 저장 raw/재열기/undo-redo·기본 가드, 독립 파일 변환 저장을 준비한다. 기존 writer4·live image8·chart5를 같은 probe에 포함해 named23를 등록한다. CLI replacement media API와 원본 raw 읽기·렌더링은 이 수정으로 바꾸지 않는다.

격리 공식 갤러리의 009e24b5 WASM에서 실제 브라우저로 HWP5 PNG·JPEG를 삽입했다. 64×32 원본 전체가 96×48 CSS 픽셀에 표시됐고, 색상과 경계, 한 번의 이력, 저장·실행 취소·다시 실행·재열기를 확인했다. 독립 CFB 검사에서 등록 이미지 바이트와 비대상 스트림이 그대로 보존됐다.

`a5d3a15f`에 포함된 결합 엔진 e8c4676c와 정상 공개 SDK 빌드에서 같은 두 삽입·저장·이력·재열기를 검증했다. 두 파일은 격리 브라우저의 저장 파일과 전체 바이트가 일치했고, 각 파일을 독립 CFB 검사에 다시 통과시켰다. 이 결과의 실제 화면 관측은 009e24b5 코호트에 속한다.
