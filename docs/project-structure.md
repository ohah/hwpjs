# 파일·폴더 구조

[HWP5 각주·미주 안 자동 번호 관계](hwp5-note-number-links.md)는 `src/hwp5/body/note_number_links.zig`가 기존 Tree/Groups와 번호 원값 파서를 연결하고, `tests/hwp5/note-number-links.mjs`가 테스트용 문서 보고서를 원시 레코드로 독립 대조합니다. 표시 번호 생성과 저장은 후속 책임입니다.

[각주·미주 본문](hwpx-note-bodies.md)은 `note_bodies.zig`가 section 주석·목록·직접 문단의 관계와 원문 수명, `note_body_fields.zig`가 주석 속성, 기존 `para_list_attributes.zig`가 목록 속성을 소유합니다. 실파일 대조는 `hwpx_note_bodies_survey.zig`와 `tools/hwpx-note-bodies-diff.py`가 맡습니다.

[각주·미주 원문 위치](hwpx-note-sites.md)는 `note_site.zig`가 기존 주석 보고서에 넣을 조상 요소 인덱스와 section XML 바이트 오프셋만 계산합니다. 기존 주석 corpus 조사기에 별도 해시를 추가하고 `tools/hwpx-note-sites-diff.py`로 독립 대조합니다.

[각주·미주 텍스트 소유](hwpx-note-text.md)는 `note_text.zig`가 같은 section 트리의 `hp:t`와 주석 사이 관계·소유 UTF-8 조각만 맡습니다. 독립 XML 대조는 `hwpx_note_text_survey.zig`와 `tools/hwpx-note-text-diff.py`가 맡습니다.

[각주·미주 안 번호 관계](hwpx-note-number-links.md)는 `note_number_links.zig`가 두 기존 보고서와 같은 section 트리의 부모 인덱스만 연결합니다. 원값 파서를 복제하지 않으며 독립 대조는 `hwpx_note_number_links_survey.zig`와 `tools/hwpx-note-number-links-diff.py`가 맡습니다.

[Section 번호 컨트롤 원값](hwpx-number-controls.md)은 `number_controls.zig`가 트리 순회·원문·직접 자식·소유권, `number_control_fields.zig`가 속성 해석, `numbering_values.zig`가 각주/미주와 공유하는 번호 enum 어휘를 맡습니다. 실파일 대조는 `hwpx_number_controls_survey.zig`와 `tools/hwpx-number-controls-diff.py`가 맡습니다.

[HWPX JPEG 선택 픽셀 검사](hwpx-jpeg-pixels.md)는 `src/image/jpeg/pixel_inspection.zig`의 공통 JFIF 복호화 코어를 HWP5와 공유하고, `src/hwpx/image_payloads.zig`가 HWPX의 ZIP 선택·옵션·보고서 한도를 소유합니다. 독립 corpus 조사는 `src/hwpx_jpeg_pixel_survey.zig`와 Python 조사기에 둡니다.

[Adobe APP14 4성분 JPEG](jpeg-adobe-four-component.md)는 선택적 Exif 색 선언과 픽셀 산술을 분리하며, `src/image/jpeg/adobe_cmyk_colour.zig`가 unmanaged 변환을 소유합니다.

[PNG RGBA 픽셀 조립](png-rgba.md)은 `src/image/png/pixels.zig`의 복원 행과 보존한 팔레트·tRNS를 재사용하며, `rgba_raster.zig`가 출력 버퍼·색 깊이 축소·Adam7 배치를 소유합니다. 선택적 문서 연결은 [HWP5 BinData](hwp5-bin-data-png-rgba.md)와 [HWPX 이미지](hwpx-png-rgba.md)가 각각 소유합니다.

[HWPX BMP 픽셀 검사](hwpx-bmp-pixels.md)는 `src/hwpx/image_payloads.zig`가 세 이미지 보고서의 공통 ZIP·한도·결과를 소유하고 `src/image/bmp/pixels.zig`의 RGBA 디코더를 재사용합니다. 선택 실파일 대조는 `src/hwpx_bmp_pixel_survey.zig`에 둡니다.

[HWPX OLE 관측 편차 복사본 검사](hwpx-ole-observed-repairs.md)는 `src/cfb/observed_repairs.zig`가 세 가지 비준수 메타데이터 위치만 임시 치환하고 같은 strict reader를 다시 호출합니다. `src/hwpx/ole_payloads.zig`는 원본 실패와 복사본 결과를 분리합니다.

[HWPX OLE 패키지 사본 검사](hwpx-ole-payloads.md)는 `src/hwpx/ole_payloads.zig`가 OPF 후보·외부 선언과 ZIP 내 사본을 분리하고 `src/ole/`의 공통 strict CFB 계층을 재사용합니다. HWP5의 `src/hwp5/ole/`은 같은 계층을 재노출합니다.

[OPF 이미지 후보 전수 검사](hwpx-manifest-image-payloads.md)는 `src/hwpx/manifest_image_payloads.zig`가 선택하고 `image_payloads.zig`의 바이트 검사기를 공유합니다.

SVG XML 루트 검사는 `src/image/svg/`가 소유하고, HWPX의 ZIP/OPF 선택·MIME 진단은 [내장 SVG 연결](hwpx-svg-image-payloads.md)에 기록합니다.

HWPX 조건부 분기 정책은 `src/hwpx/compatibility_selection.zig`가 소유하고 이진·차트·서식 참조 및 section 텍스트 스캐너가 공유합니다. 이진·차트 참조의 선택 범위는 [조건부 참조 선택](hwpx-switch-selection.md)에 기록합니다.

section 텍스트 스캐너도 같은 정책을 쓰되, 선택된 이벤트·순번의 계약은 [선택 분기 텍스트](hwpx-selected-section-text.md)가 소유합니다.

section 문단·run 서식 참조의 선택 결과는 기존 `section_references.zig`에 정책을 연결하고 [선택 분기 서식 참조](hwpx-selected-style-references.md)에 별도 기록합니다.

## 프로젝트와 현재 범위

`secPr`의 쪽 테두리·배경과 직접 `offset` 원값은 [구역 쪽 테두리·배경](hwpx-section-page-borders.md)이, header ID 연결은 [구역 쪽 테두리 참조](hwpx-section-page-border-references.md)가 담당합니다. 실제 페이지별 적용·저장은 별도 후속 책임입니다.

`secPr`의 네 직접 설정 요소 원값은 [구역 직접 설정](hwpx-section-direct-settings.md)이 담당합니다. 원값 검사는 쪽 배치·번호 매기기 의미의 완성이 아닙니다.

`secPr`의 각주·미주 모양 다섯 직접 자식의 원값은 [구역 각주·미주 모양](hwpx-section-note-shapes.md)이 담당합니다. 본문 연결과 번호/배치 적용은 별개입니다.

`secPr`의 `presentation` 속성과 직접 `fillBrush` 위치는 [구역 프레젠테이션](hwpx-section-presentation.md)이 담당합니다. 내부 필드 원값은 별도 공통 브러시 검사가 맡고, 효과 적용은 후속 책임입니다.

선택된 header·section의 공통 브러시 변형과 직접 색·이미지 값은 [공통 fillBrush](hwpx-fill-brush.md)가 담당합니다. [마스터페이지 브러시](hwpx-master-fill-brush.md)는 동일 필드 검사기를 별도 파트 경계에서 재사용합니다. [이미지 OPF 연결](hwpx-fill-brush-image-links.md)은 각 이미지 ID를 기존 manifest 해결 규칙으로 연결하고 [이미지 바이트 검사](hwpx-fill-brush-image-payloads.md)는 내장 대상의 ZIP/형식 경계를 확인합니다. 전체 픽셀·렌더링은 후속 단계입니다.

본문과 마스터페이지의 직접 `pic/img`별 OPF 대상은 [그림 이미지 연결](hwpx-picture-image-links.md)이 같은 ID 해결 규칙으로 관측합니다. [그림 이미지 바이트 검사](hwpx-picture-image-payloads.md)는 내장 대상의 공통 ZIP/형식 판정, WMF framing·[TIFF 구조 검사](tiff-structure.md)·[PCX RLE 경계](pcx-structure.md)를 재사용합니다. 그림 배치·렌더링은 아직 별개입니다.

[본문 수식 원문·script](hwpx-equations.md)는 `src/hwpx/equation.zig`가 소유하고, 여섯 전용 속성의 판정은 `equation_fields.zig`에 둡니다. [공통 도형 자식·필드](hwpx-equation-shapes.md)의 소유 원값은 `equation_shape.zig`, 표와 공유하는 자식 선택은 `shape_xml_children.zig`에 둡니다. [수식 caption 목록](hwpx-equation-captions.md)은 `equation_caption.zig`가 결과를 소유하고 `shape_caption.zig`가 표와 순회를 공유합니다. [수식 주석 문자열](hwpx-equation-comments.md)은 `equation_comment.zig`가 직접 텍스트를 소유합니다. XML/공통 도형 어휘를 재사용하지만 수식 해석·편집은 하지 않습니다.

[Section 파라미터 목록](hwpx-parameter-lists.md)은 `parameter_lists.zig`가 `parameterset`과 `fieldBegin/parameters`의 공통 재귀·소유 결과를 맡고, `hwpx_parameter_lists_survey.zig`와 `tools/hwpx-parameter-lists-diff.py`가 실파일의 독립 XML 대조를 맡습니다. 수식·표 자식 스캐너는 기존 원문 보존 책임을 유지합니다.

[Section metaTag 직접 텍스트](hwpx-meta-tags.md)는 `meta_tags.zig`가 부모 종류와 무관한 선택·소유 결과를 맡고, `hwpx_meta_tags_survey.zig`와 `tools/hwpx-meta-tags-diff.py`가 실파일의 독립 XML 대조를 맡습니다. 수식·표 스캐너의 원문 보존과 별도 API입니다.

[Section indexmark·dutmal 문자열 컨트롤](hwpx-inline-string-controls.md)은 `inline_string_controls.zig`가 두 부모의 직접 자식·속성·소유 결과를 맡고, `hwpx_inline_string_controls_survey.zig`와 `tools/hwpx-inline-string-controls-diff.py`가 실파일의 독립 XML 대조를 맡습니다.

[Section 필드 시작·끝 마커](hwpx-field-markers.md)는 `field_marker_fields.zig`가 어휘, `field_marker_links.zig`가 명시적 ID 연결, `field_markers.zig`가 section 순회·소유 결과를 맡습니다. `hwpx_field_markers_survey.zig`와 `tools/hwpx-field-markers-diff.py`는 별도 실파일 대조를 맡습니다.

[Section 단 설정 원값](hwpx-column-definitions.md)은 `column_definitions.zig`가 순회·소유, `column_fields.zig`가 단/자식 속성, `line_style_values.zig`가 각주 구분선과 공유하는 선 어휘를 맡습니다. 실파일 대조는 `hwpx_column_definitions_survey.zig`와 `tools/hwpx-column-definitions-diff.py`가 맡습니다.

`xml_direct_text.zig`는 수식 script·shapeComment, 파라미터 스칼라, section metaTag, indexmark·dutmal 문자열의 직접 XML 문자 청크 누적과 바이트 한도를 한 곳에서 처리합니다. 각 모듈은 대상 선택·예산 소유·보고서 형식만 맡고 XML 정규화를 다시 구현하지 않습니다.

구역 정의의 번호·메모 모양 ID 연결은 [구역 참조 진단](hwpx-section-definition-references.md)이 소유합니다. 진단 결과를 HWPX 문서 전체 유효성 판정으로 사용하지 않습니다.

HWP/HWPX 읽기·편집·저장을 목표로 하는 Zig 0.16.0 / WebAssembly 라이브러리입니다.
현재는 바이트 리더, CFB v3/v4 읽기·strict 검증·새 컨테이너 생성/재저장, HWP5 헤더·압축 스트림·레코드 경계와 DocInfo 주요 리소스 해석·활성 참조 검증, 본문 문단 헤더·UTF-16 텍스트/제어문자 토큰 코어가 구현되어 있습니다. HWPX에는 [ZIP·mimetype 읽기 경계](hwpx-zip-container.md), [패키지 관계 검증](hwpx-package-relationships.md), [버전 XML 검증](hwpx-version.md), [암호화 분류](hwpx-protection.md), [header·spine 구조 검증](hwpx-document-structure.md), [header 리소스 ID 색인](hwpx-header-resources.md), [section 서식 참조 진단](hwpx-section-references.md), [header 내부 서식 참조](hwpx-header-references.md), [언어별 글꼴 ID 참조](hwpx-font-references.md), [번호·글머리표 내부 참조](hwpx-list-references.md), [이진 리소스 manifest 연결](hwpx-binary-references.md), [차트 ZIP 경로·XML 경계](hwpx-chart-references.md), [section 텍스트 토큰 이벤트](hwpx-section-text.md), [header 원문·요소 인덱스](hwpx-header-tree.md), [section 원문·요소 인덱스](hwpx-section-tree.md), [문서 XML 트리 조립](hwpx-document-trees.md), [문단 메타 속성 검사](hwpx-paragraph-metadata.md), [본문 수식 원문·script](hwpx-equations.md) 등이 추가됐으며 전체 의미 문서 모델·레이아웃·본문 편집·저장은 미구현입니다. HWP5 코어는 테스트용 WASM에서 검증하며 제품 JS 공개 API는 아직 CFB만 제공합니다. 지원 범위는 구현·테스트로 확인하고, 예정 기능을 완료된 기능처럼 설명하지 않습니다.

## 진입점과 공통 계층

- `src/binary/`: 경계 검사와 바이너리 읽기.
- `src/text/`: [BCP 47 문법·중복 검사](bcp47-syntax.md), [IANA 등록 검증](bcp47-registry.md), [공통 Unicode scalar 해석·UTF-16 검사](icc-localized-unicode.md). PNG iTXt가 공통 언어 검사를, XML과 ICC가 공통 문자 해석을 재사용합니다.

  [ISO 639 두 글자 코드 조회](iso639-alpha2.md)는 IANA 목록과 별도의 고정 ISO 목록·확인된 폐기 이력을 다룹니다.
- `src/image/`: [PNG 청크 구조·CRC 검사](png-structure.md), [행 필터 복원](png-filters.md), [IDAT 이미지 데이터 검증](png-pixels.md), [RGBA 픽셀 조립](png-rgba.md), [tRNS 투명도](png-transparency.md), [배경색·히스토그램](png-palette-metadata.md), [물리적 크기·유효 비트](png-sample-metadata.md), [수정 시각](png-timestamp.md), [비압축 텍스트](png-text.md), [압축 텍스트](png-compressed-text.md), [국제 텍스트](png-international-text.md), [추천 팔레트](png-suggested-palettes.md), [Placeable WMF 헤더·generic record framing](wmf-header.md), [WMF Object Table 수명](wmf-object-table.md), [WMF pen·brush·font payload](wmf-create-payloads.md), [WMF 고정 길이 상태·좌표 레코드](wmf-state-records.md), [WMF polygon·polyline·ellipse·rectangle](wmf-drawing-records.md), [WMF text·escape records](wmf-text-escape-records.md), [strict embedded EMF payload](wmf-enhanced-metafile.md), [EMF framing·Object Table 상태](emf-framing.md), [EMF 핸들·팔레트 record 호환성](emf-handle-record-compatibility.md). HWP의 선택적 연결은 [BinData 이미지 검사](hwp5-bin-data-images.md)가 소유합니다. [JPEG](hwp5-bin-data-jpeg.md)·[BMP](hwp5-bin-data-bmp.md)·[PNG RGBA](hwp5-bin-data-png-rgba.md)도 선택적으로 연결합니다. HWPX의 [PNG RGBA](hwpx-png-rgba.md)는 별도 ZIP/OPF 예산을 소유합니다. 나머지 WMF/EMF payload·렌더링은 후속 단계입니다.
- `src/xml/`: [XML 1.0 문자 입력](xml-input.md), [선언·인코딩 시작 처리](xml-declaration.md), [이름·참조](xml-names-references.md), [태그·속성 토큰](xml-tags.md), [문서 구조 검증](xml-document.md), [namespace 검증](xml-namespaces.md). 공통 순회를 HWPX 패키지·버전·header·section 구조 검사에 재사용하지만 DTD·스키마 검증과 section 의미 해석은 아직 미구현입니다.
- `src/zip/`, `src/hwpx/`: [ZIP 인덱스·제한된 해제와 HWPX mimetype 식별](hwpx-zip-container.md), [OCF 루트·OPF manifest/spine 관계](hwpx-package-relationships.md), [버전 XML 검증](hwpx-version.md), [암호화 분류](hwpx-protection.md), [header·spine XML 구조](hwpx-document-structure.md), [header 리소스 ID 색인](hwpx-header-resources.md), [section의 p/run 서식 참조](hwpx-section-references.md), [header 내부 서식 참조](hwpx-header-references.md), [언어별 글꼴 ID와 fontRef](hwpx-font-references.md), [번호·글머리표 내부 참조](hwpx-list-references.md), [이진 리소스 manifest 연결](hwpx-binary-references.md), [차트 ZIP 경로·XML 경계](hwpx-chart-references.md). 나머지 header/section 내부 참조·문서 모델 조립은 아직 미구현입니다.

  [XML 네임스페이스 버전 경계](hwpx-namespace-profiles.md)는 2011 XML 의미 검사와 이후 OWPML 루트의 명시적 미지원 진단을 구분합니다.

  차트 XML 안의 개수·인덱스·값 요소는 별도 [차트 데이터 캐시 구조](hwpx-chart-cache.md) 계층이 검사합니다.
  `numRef`·`strRef`의 수식·캐시 연결은 [차트 수식 참조 구조](hwpx-chart-formula.md) 계층이 검사합니다.
  공통 XML 본문 view를 이용한 차트 값·수식 길이·빈 값은 [차트 텍스트 관측](hwpx-chart-text.md)이 소유합니다.
  값 leaf의 `_xHHHH_` 해독과 서로게이트 진단은 [차트 ST_Xstring](hwpx-xstring.md)이 소유합니다.
  section의 `hp:t` 본문·내부 요소 이벤트는 [section 텍스트](hwpx-section-text.md)가 소유합니다.
  이벤트의 소유 복사와 독립 자원 한도는 [section 텍스트 스냅샷](hwpx-section-text-snapshot.md)이 소유합니다.
  모든 header·section XML 요소의 원문 byte span·부모 관계는 공통 `xml_part_tree.zig`가 소유하며 각각 [header 구조 인덱스](hwpx-header-tree.md)·[section 구조 인덱스](hwpx-section-tree.md)가 선택 정책을 적용합니다.
  header·section 요소별 직접 문자·CDATA의 원문 순회와 부모 연결은 공통 `xml_part_content.zig`가 소유하며 계약은 [section 콘텐츠 순회](hwpx-section-content.md)와 [header 트리](hwpx-header-tree.md)에 기록합니다.
  모든 선택 XML 트리의 소유권·합계 한도는 [문서 XML 트리 조립](hwpx-document-trees.md)이 소유합니다.
  문단의 `id`·`paraTcId`·Boolean 값과 부재 진단은 [문단 메타 속성 검사](hwpx-paragraph-metadata.md)가 소유합니다.
  section 문단의 직접 `run`·`linesegarray`·미등록 자식 분류는 [문단 직접 자식 구조](hwpx-paragraph-children.md)가 소유합니다.
  직접 `linesegarray`의 `lineseg` 원값과 추가 요소 진단은 [문단 줄 조각](hwpx-line-segments.md)이 소유합니다.
  마스터페이지의 같은 필드 판정 재사용·별도 선택 범위는 [마스터페이지 문단 줄 조각](hwpx-master-line-segments.md)이 소유합니다.
  마스터페이지 문단의 run·배열 직접 자식 분류 재사용은 [마스터페이지 문단 직접 자식](hwpx-master-paragraph-children.md)이 소유합니다.
  마스터페이지의 `hp:t` 내용·인라인 이벤트는 [마스터페이지 텍스트](hwpx-master-text.md)가 section 공통 스캐너를 재사용하고 파트 범위만 별도로 소유합니다.
  그 이벤트의 호출 수명 밖 소유 복사는 [마스터페이지 텍스트 스냅샷](hwpx-master-text-snapshot.md)이 공통 스냅샷 빌더를 재사용합니다.
  section·마스터페이지 스냅샷의 선택 실파일 내용/순서 해시는 `src/hwpx_text_snapshot_corpus_common.zig`가, Python XML 이벤트 규칙은 `tools/hwpx_text_snapshot_order.py`가 공유합니다. 파트 선택은 각 조사기가 따로 소유합니다.
  마스터페이지의 그림·도형·OLE manifest ID 연결은 [마스터페이지 이진 참조](hwpx-master-binary-references.md)가 기존 ID 색인·분류를 재사용합니다.
  마스터페이지의 차트 ZIP 경로·대상 XML 검사는 [마스터페이지 차트 참조](hwpx-master-chart-references.md)가 section 차트 Resolver를 재사용합니다.
  마스터페이지의 직접 `subList` 범위 안 표 격자는 [마스터페이지 표 격자](hwpx-master-table-geometry.md)가 section의 표 판정을 재사용합니다.
  조건부 분기의 활성 표만 따로 보려면 [선택 분기 표 격자](hwpx-selected-table-geometry.md)가 공통 선택 정책과 같은 표 판정을 연결합니다.
  Header의 여섯 `beginNum` 원값과 부재 진단은 [Header 시작 번호](hwpx-header-begin-numbers.md)가 소유합니다.
  section `secPr/pagePr/margin`의 치수·방향·여백 원값은 [HWPX 쪽 설정](hwpx-page-geometry.md)이 소유합니다.
  `secPr` 자신의 속성·직접 자식 인벤토리는 [HWPX 구역 정의](hwpx-section-definitions.md)가 소유합니다.
  모든 ZIP 엔트리의 실제 해제·CRC와 OPF 목록 밖 항목 분류는 [바이트 무결성](hwpx-payload-integrity.md)이 소유합니다.
  OPF가 XML로 선언한 내장 항목의 전수 문법·namespace 검사와 합계 예산은 [manifest XML](hwpx-manifest-xml.md)이 소유합니다.
  `settings.xml`의 Caret·config 원값과 지원된 숫자/Boolean 검사는 [settings](hwpx-settings.md)가 소유합니다.
  마스터페이지 루트 원값과 section의 `idRef` 연결은 [masterpage](hwpx-master-pages.md)가 소유하며, 직접 `subList`의 공통 속성은 [ParaListType](hwpx-para-list.md)이, 그 아래 문단 메타 값은 [공통 문단 규칙](hwpx-paragraph-metadata.md)이 소유합니다.
  마스터페이지 문단·run의 header ID 연결은 [마스터페이지 서식 참조](hwpx-master-style-references.md)가 소유하며, section과 공통 속성→테이블 판정을 재사용합니다.
  조건부 분기의 활성 문단·run만 연결하는 별도 보고서는 [선택 분기 마스터페이지 서식 참조](hwpx-selected-master-style-references.md)가 소유합니다.
  section·마스터페이지 run의 변경 추적 ID 원값은 [run 메타 속성](hwpx-run-metadata.md)이 소유합니다.
  같은 범위의 run 부모·직접 자식과 `secPr` 순서 진단은 [run 위치·자식](hwpx-run-topology.md)이 소유합니다.
  직접 run 자식 `switch`의 분기 구조와 요구 namespace 원값은 [조건부 switch 구조](hwpx-switch-shape.md)가 별도 소유합니다.
  section·마스터페이지 `hp:t`의 선택 속성·직접 자식 진단은 [text 노드](hwpx-text-nodes.md)가 소유합니다.
  그 안의 직접 `hp:tab` 속성 판정은 [인라인 탭](hwpx-inline-tab.md)이 별도 소유합니다.
  `markpenBegin`·`markpenEnd`·`titleMark`의 직접 자식 속성 판정은 [인라인 주석 마커](hwpx-inline-annotations.md)가 별도 소유합니다.
  네 종류의 삽입·삭제 변경 추적 태그 속성 판정은 [인라인 변경 추적 태그](hwpx-track-change-tags.md)가 별도 소유합니다.
  기존 검사들을 같은 문서에 적용한 소유 보고서·정리 순서는 [현재 지원 검사 묶음](hwpx-known-inspections.md)이 소유합니다.
  section의 표·행·셀 좌표와 병합 점유 진단은 [표 격자 구조](hwpx-table-geometry.md)가 소유하며, 셀 의미나 배치는 아직 검증하지 않습니다.
  표 자체의 pageBreak·반복 머리글·간격·테두리 ID 원값과 참조는 [표 자체 속성](hwpx-table-attributes.md)이 소유합니다.
  표 직접 `inMargin`·`cellzoneList`와 구역의 좌표·테두리 ID 진단은 [표 직접 자식](hwpx-table-children.md)이 소유합니다.
  표의 상속 shape 속성 및 `sz`·`pos`·`outMargin`·`caption`·`label` 직접 자식 진단은 [표 shape](hwpx-table-shape.md)가 소유합니다.
  행·셀의 모델 밖 직접 자식·속성과 알려진 자식의 관측 순서는 [표 행·셀 topology](hwpx-table-child-topology.md)가 소유합니다.
  직접 셀의 크기·여백·속성 원값과 `borderFillIDRef`의 header ID 연결은 [표 셀 필드](hwpx-table-cell-fields.md)가 소유합니다.
  직접 셀의 `subList` 경계·공통 속성·직접 문단 수는 [표 셀 목록](hwpx-table-cell-sublists.md)이 소유합니다.
- `src/cfb/`: 읽기·검증·저장을 책임별로 분리한 CFB 코어.
- `src/hwp5/`: 헤더 원본·버전·스트림 정책·압축 trailer·레코드 framing을 분리합니다. 현재 계약·검증 범위는 [HWP5 모듈 계약](hwp5-modules.md), 과거 이력은 [구현/검증 기록](hwp5-foundation.md)을 참조합니다.
  선택적 BinData PCX 연결은 [별도 계약](hwp5-bin-data-pcx.md)이 소유하고 `src/image/pcx/`의 공통 검사기를 재사용합니다.
  선택적 BinData WMF 연결은 [별도 계약](hwp5-bin-data-wmf.md)이 소유하고 `src/image/wmf/`의 공통 헤더·record 검사기를 재사용합니다.
  선택적 PNG IEND 뒤 0 패딩 정책은 [별도 계약](hwp5-png-post-iend.md)이 소유하며, 공통 구조 검사를 재사용하고 HWP5 문서 전체 예산만 연결합니다.
  PNG 선언·JPEG 실제 바이트의 선택적 검사도 [별도 계약](hwp5-png-declared-jpeg.md)이 소유하며, 기존 JPEG 검사기를 재사용합니다.
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

- [GIF 블록·LZW·색인 프레임](gif-indexed.md)
- [HWPX 마스터페이지 fillBrush 원값](hwpx-master-fill-brush.md)
- [HWPX fillBrush 이미지 OPF 연결](hwpx-fill-brush-image-links.md)
- [HWPX fillBrush 이미지 바이트 검사](hwpx-fill-brush-image-payloads.md)
- [PrvImage 소비·이미지 검사와 GIF 집계 연결](hwp5-preview-image.md)

- [BMP 파일·DIB 헤더·저장 경계](bmp-structure.md)
- [BMP 비압축 RGBA·검증](bmp-pixels.md)
- [BMP RLE4/RLE8 명령·색인 평면](bmp-rle.md)
- [BMP RLE RGBA·채움 정책](bmp-rle-rgba.md)
- [BMP V5 프로파일 범위·ICC 검사](bmp-profile.md)
- [HWP BMP RLE 검사](hwp5-bin-data-bmp-rle.md)
- [HWP BMP V5 프로파일 검사](hwp5-bin-data-bmp-profile.md)
- [JPEG 마커·엔트로피 경계](jpeg-framing.md)
- [JPEG Adobe APP14 원값·인쇄용 색 해석 경계](jpeg-adobe.md)
- [JFIF RGB 샘플 조립·미완료 색 관리 경계](jpeg-rgb.md)
- [JPEG 관측 성분 ID 호환 정책](jpeg-component-id-compatibility.md)
- [Exif 선두 Adobe 색 선언 JPEG 픽셀](jpeg-exif-adobe-rgb.md)
- [Exif IFD0 방향 원값](jpeg-exif-orientation.md)
- [Progressive JPEG 블록 계수 복호화](jpeg-progressive-block.md)
- [Progressive JPEG 스캔·restart 조립](jpeg-progressive-scan.md)
- [Progressive JPEG 프레임 계수 저장·표 수명](jpeg-progressive-frame.md)
- [Progressive JPEG 샘플 평면·검증](jpeg-progressive-samples.md)
- [Progressive JFIF RGB·정밀도 이력](jpeg-progressive-rgb.md)
- [PNG 감마·색도 원값 검사](png-color-fixed.md)
- [PNG sRGB 필드·동반 청크 검사](png-srgb.md)
- [PNG iCCP 구현 작업·미완료 경계](png-embedded-profile.md)
- [ICC 헤더·식별자 구현 작업](icc-structure.md)
- [EMF color-space 생성 record 호환성](emf-color-space-record-compatibility.md)
- [EMF poly record 후행 호환성](emf-poly-record-compatibility.md)
- [EMF 글꼴 생성 객체](emf-font-creation.md)
- [EMF 비트맵 브러시](emf-bitmap-brush.md)
- [EMF 확장 펜](emf-extended-pen.md)
- [EMF EOF 팔레트](emf-eof-palette.md)
- [EMF Header 가변 payload](emf-header-payload.md)
- [EMF pixel format record](emf-pixel-format-record.md)
- [EMF image color management mode](emf-icm-mode.md)
- [EMF 고정 clipping records](emf-fixed-clipping-records.md)
- [EMF clipping selection과 RegionData](emf-clipping-selection.md)
- [EMF RegionData drawing records](emf-region-drawing.md)
- [EMF path 그리기 records](emf-path-drawing.md)
- [EMF 확장 flood fill](emf-flood-fill.md)
- [EMF gradient fill](emf-gradient-fill.md)
- [EMF bit block transfer](emf-bit-block-transfer.md)
- [EMF stretch block transfer](emf-stretch-block-transfer.md)
- [EMF masked block transfer](emf-mask-block-transfer.md)
- [EMF parallelogram block transfer](emf-parallelogram-block-transfer.md)
- [EMF scanline bitmap transfer](emf-set-dibits-to-device.md)
- [EMF stretched DIB transfer](emf-stretch-dibits.md)
- [EMF alpha blend](emf-alpha-blend.md)
- [EMF transparent bitmap transfer](emf-transparent-blt.md)
- [EMF layout mode](emf-layout-mode.md)
- [EMF linked universal font IDs](emf-linked-ufis.md)
- [EMF forced universal font mapping](emf-force-ufi-mapping.md)
- [EMF text justification](emf-text-justification.md)
- [EMF target color matching](emf-color-match-target.md)
- [EMF palette color correction](emf-color-correct-palette.md)
- [EMF color adjustment](emf-color-adjustment.md)
- [EMF comment envelope](emf-comment-envelope.md)
- [EMF public comments](emf-public-comments.md)
- [EMF+ 공통 record stream](emf-plus-record-stream.md)
- [EMF+ RecordType 58개 wire 지원 매트릭스](emf-plus-record-coverage.md)
- [EMF+ GetDC와 classic EMF interleaving](emf-plus-get-dc-interleaving.md)
- [EMF+ private comment와 reserved records](emf-plus-comment-records.md)
- [EMF+ Object 레코드와 64슬롯 객체 테이블](emf-plus-object-record.md)
- [EMF+ SerializableObject와 11개 Image Effects](emf-plus-serializable-object.md)
- [EMF+ 객체 공통 값과 gradient 보조 객체](emf-plus-common-objects.md)
- [EMF+ drawing PointData 절대 좌표 해석](emf-plus-point-resolution.md)
- [EMF+ polyline·polygon 선분 조립](emf-plus-polyline-geometry.md)
- [EMF+ DrawLines·FillPolygon device-space 선분](emf-plus-polyline-device-segments.md)
- [EMF+ 연결 cubic Bézier 조립](emf-plus-bezier-geometry.md)
- [EMF+ DrawBeziers device-space segment](emf-plus-bezier-device-segments.md)
- [EMF+ Cubic Bézier evaluation](emf-plus-cubic-evaluation.md)
- [EMF+ Cubic Bézier subdivision](emf-plus-cubic-subdivision.md)
- [EMF+ Cubic Bézier derivative와 flatness metric](emf-plus-cubic-analysis.md)
- [EMF+ Cubic Bézier adaptive flattening](emf-plus-cubic-flattening.md)
- [EMF+ 연결 Bézier device polyline](emf-plus-bezier-device-polyline.md)
- [EMF+ cardinal spline span 조립](emf-plus-cardinal-spans.md)
- [EMF+ cardinal spline device-space span](emf-plus-cardinal-device-spans.md)
- [EMF+ Path와 가변 좌표·RLE point types](emf-plus-path-object.md)
- [EMF+ Path figure·Line·Bézier geometry 조립](emf-plus-path-geometry.md)
- [EMF+ Path device figure polyline](emf-plus-path-device-polyline.md)
- [EMF+ Path device stroke·fill boundary polyline](emf-plus-path-device-boundary-polyline.md)
- [EMF+ Path device boundary edge iterator](emf-plus-path-device-boundary-edges.md)
- [EMF+ Path device-space command](emf-plus-path-device-commands.md)
- [EMF+ Path device marker points](emf-plus-path-device-marker-points.md)
- [EMF+ Path device 원본 point 순회](emf-plus-path-device-source-points.md)
- [EMF+ Path device DashMode 플래그 point](emf-plus-path-device-dash-points.md)
- [EMF+ Path device figure geometry](emf-plus-path-device-geometry.md)
- [EMF+ Path 명시적 closing segment 조립](emf-plus-path-segments.md)
- [EMF+ Path 열린 figure fill boundary 조립](emf-plus-path-fill-segments.md)
- [EMF+ Path stroke·fill device-space segment](emf-plus-path-device-segments.md)
- [EMF+ RectData world·device corner geometry](emf-plus-rect-device-corners.md)
- [EMF+ rectangle records device-corner connection](emf-plus-rect-record-device-corners.md)
- [EMF+ Ellipse affine device basis](emf-plus-ellipse-device-basis.md)
- [EMF+ Ellipse exact rational quadratic segments](emf-plus-ellipse-device-segments.md)
- [EMF+ Arc and Pie affine device geometry](emf-plus-arc-device-geometry.md)
- [EMF+ Arc endpoints and Pie radial edges](emf-plus-arc-device-points.md)
- [EMF+ Arc exact rational quadratic segments](emf-plus-arc-device-segments.md)
- [EMF+ Arc rational quadratic evaluation](emf-plus-arc-segment-evaluation.md)
- [EMF+ Arc rational quadratic 평탄화](emf-plus-arc-segment-flattening.md)
- [EMF+ Arc·Ellipse device polyline](emf-plus-arc-device-polyline.md)
- [EMF+ Pie device boundary](emf-plus-pie-device-boundary.md)
- [EMF+ Pie device boundary polyline](emf-plus-pie-device-polyline.md)
- [EMF+ DrawImagePoints destination parallelogram 조립](emf-plus-image-parallelogram.md)
- [EMF+ DrawImagePoints SrcRect affine transform](emf-plus-image-affine-map.md)
- [EMF+ DrawImagePoints source→device map](emf-plus-image-source-device-map.md)
- [EMF+ DrawImage rectangle source→device map](emf-plus-image-rect-device-map.md)
- [EMF+ 일반 world·page·device point 변환](emf-plus-world-page-device.md)
- [EMF+ Image·Bitmap·Palette·Metafile payload](emf-plus-image-object.md)
- [EMF+ 다섯 Brush payload와 선택 데이터](emf-plus-brush-object.md)
- [EMF+ CustomLineCap과 중첩 Fill/Line Path](emf-plus-custom-line-cap.md)
- [EMF+ Pen과 flag 순서 선택 데이터](emf-plus-pen-object.md)
- [EMF+ Region 이진 트리와 중첩 Path](emf-plus-region-object.md)
- [EMF+ StringFormat 고정 헤더와 가변 배열](emf-plus-string-format-object.md)
- [EMF+ Font와 UTF-16 family name](emf-plus-font-object.md)
- [EMF+ ImageAttributes 고정 객체](emf-plus-image-attributes-object.md)
- [EMF+ Clear drawing record](emf-plus-clear-record.md)
- [EMF+ FillRects의 Brush 선택과 RectData 배열](emf-plus-fill-rects-record.md)
- [EMF+ FillPolygon의 Brush 선택과 PointData](emf-plus-fill-polygon-record.md)
- [EMF+ FillEllipse의 Brush 선택과 RectData](emf-plus-fill-ellipse-record.md)
- [EMF+ FillPie의 Brush 선택과 공용 ArcData](emf-plus-fill-pie-record.md)
- [EMF+ FillRegion의 Region·Brush 객체 참조](emf-plus-fill-region-record.md)
- [EMF+ FillPath의 Path·Brush 객체 참조](emf-plus-fill-path-record.md)
- [EMF+ FillClosedCurve와 공용 curve data](emf-plus-fill-closed-curve-record.md)
- [EMF+ DrawArc와 공용 RectData](emf-plus-draw-arc-record.md)
- [EMF+ DrawBeziers와 공용 PointData](emf-plus-draw-beziers-record.md)
- [EMF+ DrawClosedCurve와 Tension](emf-plus-draw-closed-curve-record.md)
- [EMF+ DrawCurve와 Offset·NumSegments](emf-plus-draw-curve-record.md)
- [EMF+ DrawDriverString의 glyph·위치·선택 행렬](emf-plus-draw-driver-string-record.md)
- [EMF+ DrawEllipse와 공용 RectData](emf-plus-draw-ellipse-record.md)
- [EMF+ DrawImage의 객체 참조와 source/destination rectangle](emf-plus-draw-image-record.md)
- [EMF+ DrawImagePoints의 세 point 표현과 선행 effect](emf-plus-draw-image-points-record.md)
- [EMF+ DrawLines의 가변 PointData와 L 닫힘](emf-plus-draw-lines-record.md)
- [EMF+ DrawPath의 Path·Pen 객체 참조](emf-plus-draw-path-record.md)
- [EMF+ DrawPie와 DrawArc 공용 ArcData](emf-plus-draw-pie-record.md)
- [EMF+ DrawRects와 공용 RectArray](emf-plus-draw-rects-record.md)
- [EMF+ DrawString과 UTF-16·선택 객체 참조](emf-plus-draw-string-record.md)
- [EMF+ SetRenderingOrigin 고정 좌표 property](emf-plus-set-rendering-origin-record.md)
- [EMF+ SetAntiAliasMode와 SmoothingMode](emf-plus-set-anti-alias-mode-record.md)
- [EMF+ SetTextRenderingHint와 공식 Flags 예제](emf-plus-set-text-rendering-hint-record.md)
- [EMF+ SetTextContrast 12비트 gamma 범위](emf-plus-set-text-contrast-record.md)
- [EMF+ SetInterpolationMode와 공식 Flags 예제](emf-plus-set-interpolation-mode-record.md)
- [EMF+ SetPixelOffsetMode와 공식 Flags 예제](emf-plus-set-pixel-offset-mode-record.md)
- [EMF+ SetCompositingMode와 alpha blending 상태](emf-plus-set-compositing-mode-record.md)
- [EMF+ SetCompositingQuality와 Windows invalid fallback](emf-plus-set-compositing-quality-record.md)
- [EMF+ BeginContainer와 변환 Container stack](emf-plus-begin-container-record.md)
- [EMF+ BeginContainerNoParams와 공용 StackIndex](emf-plus-begin-container-no-params-record.md)
- [EMF+ EndContainer와 Container stack 종료](emf-plus-end-container-record.md)
- [EMF+ SetTSClip의 terminal-server delta rectangle](emf-plus-set-ts-clip-record.md)
- [EMF+ terminal-server clip 소유 상태](emf-plus-ts-clip-state.md)
- [EMF+ SetTSGraphics wire record](emf-plus-set-ts-graphics-record.md)
- [EMF+ terminal-server graphics 소유 상태](emf-plus-ts-graphics-state.md)
- [EMF+ MultiplyWorldTransform의 행렬과 곱셈 순서](emf-plus-multiply-world-transform-record.md)
- [EMF+ SetWorldTransform의 world matrix 교체 명령](emf-plus-set-world-transform-record.md)
- [EMF+ ResetWorldTransform의 빈 reset 명령](emf-plus-reset-world-transform-record.md)
- [EMF+ TranslateWorldTransform의 이동 거리와 곱셈 순서](emf-plus-translate-world-transform-record.md)
- [EMF+ ScaleWorldTransform의 배율과 곱셈 순서](emf-plus-scale-world-transform-record.md)
- [EMF+ RotateWorldTransform의 각도와 곱셈 순서](emf-plus-rotate-world-transform-record.md)
- [EMF+ graphics state와 world transform 재생](emf-plus-graphics-state.md)
- [EMF+ 여덟 graphics property 상태](emf-plus-property-state.md)
- [EMF+ SetPageTransform의 단위와 page scale](emf-plus-set-page-transform-record.md)
- [EMF+ page-to-device transform 재생](emf-plus-page-transform.md)
- [EMF+ ResetClip의 빈 clipping reset 명령](emf-plus-reset-clip-record.md)
- [EMF+ SetClipRect의 RectF와 CombineMode](emf-plus-set-clip-rect-record.md)
- [EMF+ SetClipPath의 Path 객체 참조와 CombineMode](emf-plus-set-clip-path-record.md)
- [EMF+ SetClipRegion의 Region 객체 참조와 CombineMode](emf-plus-set-clip-region-record.md)
- [EMF+ OffsetClip의 clipping translation](emf-plus-offset-clip-record.md)
- [EMF+ clipping graphics state 재생](emf-plus-clip-state.md)
- [EMF+ StrokeFillPath의 문서 미정의 payload 관측](emf-plus-stroke-fill-path-record.md)
- [EMF+ Save와 StackIndex wire record](emf-plus-save-record.md)
- [EMF+ Restore와 공유 graphics-state stack](emf-plus-restore-record.md)
- [EMF+ BeginContainer 좌표 변환 재생](emf-plus-container-transform.md)

- [HWP5 모듈 계약](hwp5-modules.md)
- [아키텍처와 구현 순서](architecture.md)
- [프로젝트 규칙](project-rules.md)
- [개발·검증 명령](development-commands.md)
