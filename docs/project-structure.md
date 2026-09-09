# 파일·폴더 구조

## 프로젝트와 현재 범위

HWP/HWPX 읽기·편집·저장을 목표로 하는 Zig 0.16.0 / WebAssembly 라이브러리입니다.
현재는 바이트 리더, CFB v3/v4 읽기·strict 검증·새 컨테이너 생성/재저장, HWP5 헤더·압축 스트림·레코드 경계와 DocInfo 주요 리소스 해석·활성 참조 검증, 본문 문단 헤더·UTF-16 텍스트/제어문자 토큰 코어가 구현되어 있습니다. HWP/HWPX 전체 문서 모델·레이아웃·본문 편집·저장은 미구현입니다. HWP5 코어는 테스트용 WASM에서 검증하며 제품 JS 공개 API는 아직 CFB만 제공합니다. 지원 범위는 구현·테스트로 확인하고, 예정 기능을 완료된 기능처럼 설명하지 않습니다.

## 진입점과 공통 계층

- `src/binary/`: 경계 검사와 바이너리 읽기.
- `src/text/`: [BCP 47 문법·중복 검사](bcp47-syntax.md), [IANA 등록 검증](bcp47-registry.md), [공통 Unicode scalar 해석·UTF-16 검사](icc-localized-unicode.md). PNG iTXt가 공통 언어 검사를, XML과 ICC가 공통 문자 해석을 재사용합니다.

  [ISO 639 두 글자 코드 조회](iso639-alpha2.md)는 IANA 목록과 별도의 고정 ISO 목록·확인된 폐기 이력을 다룹니다.
- `src/image/`: [PNG 청크 구조·CRC 검사](png-structure.md), [행 필터 복원](png-filters.md), [IDAT 이미지 데이터 검증](png-pixels.md), [tRNS 투명도](png-transparency.md), [배경색·히스토그램](png-palette-metadata.md), [물리적 크기·유효 비트](png-sample-metadata.md), [수정 시각](png-timestamp.md), [비압축 텍스트](png-text.md), [압축 텍스트](png-compressed-text.md), [국제 텍스트](png-international-text.md), [추천 팔레트](png-suggested-palettes.md). HWP의 선택적 연결은 [BinData 이미지 검사](hwp5-bin-data-images.md)가 소유합니다. RGBA 변환·다른 이미지 형식은 후속 단계입니다.
- `src/xml/`: [XML 1.0 문자 입력](xml-input.md), [선언·인코딩 시작 처리](xml-declaration.md), [이름·참조](xml-names-references.md), [태그·속성 토큰](xml-tags.md), [문서 구조 검증](xml-document.md), [namespace 검증](xml-namespaces.md). DTD·스키마 검증과 HWPX 통합은 아직 미구현입니다.
- `src/cfb/`: 읽기·검증·저장을 책임별로 분리한 CFB 코어.
- `src/hwp5/`: 헤더 원본·버전·스트림 정책·압축 trailer·레코드 framing을 분리합니다. 현재 계약·검증 범위는 [HWP5 모듈 계약](hwp5-modules.md), 과거 이력은 [구현/검증 기록](hwp5-foundation.md)을 참조합니다.
- `src/compression/`: bounded raw DEFLATE, [zlib 검증](zlib-validation.md), MIT Zig 디코더 로컬 수정본. HWP 플래그·trailer 정책을 넣지 않습니다.
- `src/wasm/`, `js/`: WASM 메모리·문서 수명·엔트리 변환별 어댑터.
- ABI 필드·버전·편집 모델 wire 형식은 `js/abi-schema.mjs`에서 정의합니다. 생성된 Zig 선언과 일치해야 하며 빌드에서 검사합니다. 레거시 검색은 `find.zig`, 명세 이름 비교·정렬·검색은 `name_order.zig`, 읽기/쓰기 공통 메타데이터 규칙은 `entry_rules.zig`에 둡니다.
- `src/root.zig`: Zig 라이브러리 진입점.
- `src/wasm.zig`: 브라우저용 WASM ABI 진입점.
- `build.zig`: 빌드·테스트 정의.
- `docs/architecture.md`: 모듈 책임과 구현 순서.
- `legacy/rust/`: 이전 구현·fixture·명세. 요청된 비교나 수정에만 사용합니다.
- `reference/`: 외부 참고 소스. 제품 의존성으로 자동 포함하지 않습니다.

## 상세 문서

- [JPEG 마커·엔트로피 경계](jpeg-framing.md)
- [JPEG Adobe APP14 원값·인쇄용 색 해석 경계](jpeg-adobe.md)
- [JFIF RGB 샘플 조립·미완료 색 관리 경계](jpeg-rgb.md)
- [Progressive JPEG 블록 계수 복호화](jpeg-progressive-block.md)
- [Progressive JPEG 스캔·restart 조립](jpeg-progressive-scan.md)
- [Progressive JPEG 프레임 계수 저장·표 수명](jpeg-progressive-frame.md)
- [Progressive JPEG 샘플 평면·검증](jpeg-progressive-samples.md)
- [PNG 감마·색도 원값 검사](png-color-fixed.md)
- [PNG sRGB 필드·동반 청크 검사](png-srgb.md)
- [PNG iCCP 구현 작업·미완료 경계](png-embedded-profile.md)
- [ICC 헤더·식별자 구현 작업](icc-structure.md)

- [HWP5 모듈 계약](hwp5-modules.md)
- [아키텍처와 구현 순서](architecture.md)
- [프로젝트 규칙](project-rules.md)
- [개발·검증 명령](development-commands.md)
