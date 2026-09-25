# JPEG 관측 성분 ID 호환 정책

## 계약

[ITU-T T.871 10.1](https://www.itu.int/rec/T-REC-T.871-201105-I/en)의 JFIF는 1성분 ID `1`, 3성분 ID `(1,2,3)`을 지정합니다. 공통 `src/image/jpeg/jfif.zig`의 기본 `.strict`는 이를 유지합니다. `jfif_render.Options.component_ids = .observed_zero_based_three`는 **JFIF로 적합하다는 판정이 아니라** 관측된 3성분 `(0,1,2)`만 RGB로 해석하겠다는 명시적 예외입니다. 1성분 ID `0`, 중복·재정렬·다른 ID, 4성분, 비8비트, JFIF 헤더 부재 및 기존 Adobe 색 충돌은 허용하지 않습니다.

`jfif_layout.zig`가 SOF 성분 순서와 정책을 한 곳에서 판정하고 `Report.observed_zero_based_component_ids`를 반환합니다. 순차·progressive 공통 렌더링 결과와 `pixel_inspection.Evidence`도 같은 표식을 전달합니다. HWPX 이미지 보고서의 대상별 `Target.observed_zero_based_jpeg_component_ids`는 성공한 RGB 해제에서만 true입니다. 기본 구조 검사 및 엄격 RGB 검사에는 영향이 없습니다. JPEG 엔트로피·색 변환·자원 한도는 기존 코어를 재사용하고 ID를 원문에서 고쳐 쓰지 않습니다.

## 실파일과 적대적 검증

독립 Python ZIP/마커 조사에서 JFIF 선두의 `(0,1,2)`가 32개(대형 문서 31개, 별도 문서 1개), JFIF 선두의 1성분 `0`이 1개 확인됐습니다. Exif 선두 `(0,1,2)`도 1개 있지만 이 옵션으로는 JFIF 헤더 부재 오류가 유지됩니다. 합성 ZIP 검사는 기본 거부, 명시적 성공·표식, 정규 `(1,2,3)` 성공·비표식, 잘못된 ID·Adobe 색 충돌·엔트로피 패딩 오류 거부, RGB 예산 및 모든 할당 실패를 확인합니다. Progressive 3성분 스캔 재정렬 테스트에서도 옵트인만 성공하고 색 채널 결과를 유지합니다. `2025 행정업무운영 편람(최종).hwpx`의 `image353.jpg`는 엄격 거부·옵션 해제 33,345,000 RGB 바이트를, `image401.jpg`의 1성분 ID `0`은 옵션에서도 거부됨을 확인했습니다.

`1790387_prep_final_report.hwpx`의 선택 검사에서는 JPEG 36개 모두 해제되고 이 중 31개에 비표준 표식이 붙었습니다. RGB 합계 1,099,249,830바이트는 독립 Pillow의 크기 합계와 일치합니다. 기본 256 MiB 누적 예산에서는 `LimitExceeded`를 반환하고, 이 검사에서만 2 GiB로 올렸습니다. 이는 **픽셀 바이트 일치·색 의미·화면 렌더링 동치가 아니라 출력 길이와 명시적 분류의 검증**입니다. 기본 strict corpus 715개 성공·105개 오류 기록은 변경하지 않습니다. Exif 전용 JPEG, CMYK, Adobe 충돌 및 모든 JPEG 색 관리 지원은 여전히 별도 과제입니다.

`tools/hwpx-jpeg-observed-pixel-diff.py`는 위 별도 문서의 `image353.jpg` RGB 바이트를 Pillow 11.3.0과 직접 비교합니다. 양쪽 33,345,000바이트에서 다른 채널은 27,391개이고 최대 절댓값 차이는 3입니다. 출력 SHA-256은 Zig `c3396d9614c4475afca4d549f4cdc4ebf2cbbe6684a96c0efb8b20f7fd188ed1`, Pillow `31108a53cfe483bd966e4aab074552b675797d9ec1a61e34e41422245b57777b`입니다. 이 표본에서 큰 채널 순서 오류는 관측되지 않지만 바이트 동치도 아니며, 모든 비표준 JPEG의 색 해석을 증명하지 않습니다.

최종 Debug `zig build test --summary all`은 종료 코드 0·2,522/2,522개, ReleaseSafe 제품 빌드는 5/5단계, ReleaseSafe `zero-based` 선택 테스트는 4/4개 통과했습니다. 기본 엄격 JPEG corpus 8개 shard도 각각 통과해 715개 RGB 성공·105개 대상별 오류가 유지됐습니다. 관측 정책의 실파일 세 사례와 독립 Pillow 픽셀 차이 도구는 기본 audit 밖에서 별도로 통과했습니다. 이 결과를 HWP/HWPX 문서 전체 유효성 또는 저장 지원으로 확대하지 않습니다.
