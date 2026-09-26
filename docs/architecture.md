# Zig/WASM 구현 구조

[HWPX JPEG 선택 픽셀 검사](hwpx-jpeg-pixels.md)는 HWP5와 같은 형식 코어를 재사용하되 JPEG 구조 정책·ZIP 선택·보고서 예산은 HWPX가 소유합니다. 기본 구조 검사와 명시적 JFIF RGB 검사는 다른 깊이로 표시합니다.

[관측 JPEG 성분 ID 호환 정책](jpeg-component-id-compatibility.md)은 JFIF 성분 ID 판정을 공통 배치 계층에 두고, HWPX는 명시적 선택과 대상별 비표준 표식만 연결합니다. 원본 ID를 바꾸거나 기본 strict를 완화하지 않습니다.

[Exif 선두 Adobe 색 선언 픽셀](jpeg-exif-adobe-rgb.md)은 JFIF 배치 규칙과 별개로 APP1 선두·APP14 색 선언을 확인하고 공통 샘플/RGB 코어만 공유합니다. Exif TIFF 의미와 화면 방향은 이 선택 경로에 섞지 않습니다.

[Exif IFD0 방향 원값](jpeg-exif-orientation.md)은 HWPX 이미지 대상에서 픽셀 해제와 독립적으로 선택하고 TIFF 정수 읽기만 공유합니다. 포인터 대상·나머지 필드·방향의 화면 적용은 검증하거나 수행하지 않습니다.

[HWPX BMP 픽셀 검사](hwpx-bmp-pixels.md)는 그림·브러시·OPF 전체 후보가 같은 BMP 구조·RGBA 디코더와 별도 누적 바이트 예산을 공유합니다. 구조만 본 결과와 픽셀까지 읽은 결과는 다른 검사 단계로 표시합니다.

[CFB 관측 편차 복사본 검사](hwpx-ole-observed-repairs.md)는 HWPX OLE의 원본 strict 실패 뒤에만 선택적으로 호출하며, 넓은 비엄격 읽기 모드를 문서 유효성으로 승격하지 않습니다. CFB 구조 검증은 기존 strict reader가 계속 소유합니다.

[HWPX OLE 패키지 사본](hwpx-ole-payloads.md)은 OPF 선택과 ZIP 내 정확한 사본 확인만 소유합니다. OLE 길이 봉투와 strict CFB 구조는 `src/ole/`을 HWP5와 공유하며 객체 활성화·내부 의미 해석은 하지 않습니다.

[OPF 이미지 후보 전수 검사](hwpx-manifest-image-payloads.md)는 참조 사이트와 무관한 manifest 항목 선택만 소유하고, 바이트 검사·MIME 진단은 기존 공통 이미지 코어를 재사용합니다. 전체 BinData 의미 검증과 문서 전역 이미지 예산은 아직 별도입니다.

[내장 SVG 구조 검사](hwpx-svg-image-payloads.md)는 공통 XML 문법·namespace 파서를 재사용하며, HWPX 이미지 어댑터는 형식 후보·MIME·자원 예산만 소유합니다. 스크립트/외부 참조 실행과 렌더링은 하지 않습니다.

[구역 쪽 테두리·배경 원값](hwpx-section-page-borders.md)은 기존 section 트리와 XML 숫자·Boolean 계층을 재사용합니다. `pageBorderFill`·`offset`의 부모 관계를 보존하고, 별도 [ID 참조 진단](hwpx-section-page-border-references.md)이 header 색인과 연결합니다. 레이아웃은 수행하지 않습니다.

[구역 직접 설정 원값](hwpx-section-direct-settings.md)은 소유 section 트리의 직접 `secPr` 자식만 읽습니다. XML 속성·숫자 어휘 공통 계층을 재사용하고 `strikeContinue` 관측 확장과 공식 필드를 구분합니다.

[구역 각주·미주 모양 원값](hwpx-section-note-shapes.md)은 같은 소유 section 트리의 직접 `secPr` 하위 note와 다섯 직접 자식을 분리해 관측합니다. 필드 자료형·enum은 `section_note_fields.zig`가 소유하며 본문/배치 의미는 생성하지 않습니다.

[구역 프레젠테이션 원값](hwpx-section-presentation.md)은 같은 트리에서 `presentation` 여섯 속성과 직접 `fillBrush` 연결만 관측합니다. 속성 어휘는 `section_presentation_fields.zig`가 소유하고, 공유 코어 브러시 내부는 이후 별도 계층이 소유합니다.

[공통 fillBrush 원값](hwpx-fill-brush.md)은 header·section 트리의 브러시·세 변형·직접 색/이미지 노드를 순서와 부모 연결을 유지해 검사합니다. 19개 필드의 어휘는 `fill_brush_fields.zig`가 소유하며, 브러시 효과·이미지 ID 대상/렌더링은 별도 계층입니다.

[마스터페이지 fillBrush](hwpx-master-fill-brush.md)는 선택된 ZIP 파트의 바이트·요소 예산만 별도로 소유하고, 브러시 필드·노드 검사는 공통 계층을 재사용합니다. 원문 전체 관측과 조건부 활성 분기 적용은 구분합니다.

[fillBrush 이미지 OPF 연결](hwpx-fill-brush-image-links.md)은 두 원값 보고서의 이미지 노드에 기존 이진 참조 ID 해결기를 적용합니다. 원값/선택 범위/대상 상태의 소유권을 합치지 않고 노드별 인덱스만 보관합니다.

[fillBrush 이미지 바이트 검사](hwpx-fill-brush-image-payloads.md)는 embedded manifest 항목의 ZIP 해제·형식별 공통 검사기를 재사용하며 원값·참조 선택을 소유하지 않습니다. MIME 불일치는 진단으로 남기고 JPEG의 미완료 계수·픽셀 의미와 BMP의 미적용 색상·표시 의미를 보고서에 드러냅니다.

[TIFF 구조 검사](tiff-structure.md)는 이미지 바이트 계층에서 IFD·필드·strip/tile 범위만 소유하며, HWPX의 OPF·ZIP 선택과 압축/픽셀 복호화는 소유하지 않습니다.

[PCX RLE 경계](pcx-structure.md)는 이미지 바이트 계층에서 헤더·scanline 용량·RLE 출력 길이만 소유하며, HWPX의 OPF·ZIP 선택과 픽셀·팔레트 색상 의미는 소유하지 않습니다.

[HWP5 BinData PCX 연결](hwp5-bin-data-pcx.md)은 기존 정확한 스트림 선택·항목별 압축 해제 뒤 공통 PCX 검사기를 호출하며, HWPX 선택 규칙이나 PCX RLE 문법을 복제하지 않습니다.

[HWP5 BinData WMF 연결](hwp5-bin-data-wmf.md)은 같은 스트림 선택 뒤 공통 WMF 헤더·record framing을 호출합니다. 후보 바이트 판정도 HWPX와 공유하지만 미지원 잔여 데이터나 렌더링을 통과 처리하지 않습니다.

[PNG IEND 뒤 0 패딩](hwp5-png-post-iend.md)은 공통 PNG 구조 계층이 바이트 경계와 명시적 한도를 소유하고 HWP5 컨테이너가 선택·문서 합계만 소유합니다. 기본 strict와 HWPX의 선택은 변경하지 않습니다.

[PNG 선언·JPEG 바이트 불일치](hwp5-png-declared-jpeg.md)는 HWP5 BinData의 정확한 경로·압축 정책 이후 이미지 선택 계층에서만 명시적으로 분기합니다. JPEG 검사기를 재사용하고 선언값·이미지 의미를 자동 수정하지 않습니다.

[구역 정의 ID 참조](hwpx-section-definition-references.md)는 기존 구역 정의 값과 header 리소스 ID 색인을 결합하는 진단 계층입니다. `0`·부재·미해결을 분리하고 원문 파싱을 재구현하지 않습니다.

[HWPX 조건부 참조 선택](hwpx-switch-selection.md)은 한 정책을 이진·차트 스캐너가 공유하는 선택적 계층입니다. 기존 raw 검사와 전체 문서 분기 적용은 별개입니다.

[선택 분기 section 텍스트](hwpx-selected-section-text.md)도 이 정책을 재사용하며 기본 원문 텍스트 보고서는 바꾸지 않습니다. 참조·텍스트의 활성 분기 적용이 곧 문서 모델 완성을 뜻하지는 않습니다.

[선택 분기 문단·run 서식 참조](hwpx-selected-style-references.md)는 같은 정책을 기존 header ID 해결 계층에 연결하고, 선택 텍스트의 문단·run 경계와 실파일에서 대조합니다.

[JPEG 경계 계층](jpeg-framing.md)은 마커 코드 분류·마커 세그먼트·엔트로피 바이트 스터핑을 분리합니다. 프레임/스캔 상태와 픽셀 복호화, HWP 이미지 지원 완료를 대신하지 않습니다.

PNG 감마·색도는 [고정소수점 원값 계약](png-color-fixed.md)에 분리합니다. 정수 읽기와 청크별 필드 해석·순서 검사를 분리하며, 색상 변환과 프로파일 우선순위는 원값 검사 완료와 구분합니다.

[sRGB 동반 청크 검사](png-srgb.md)는 전용 상수·순수 검사기를 metadata에서 재사용합니다. 청크 도착 순서와 무관하게 검증하고 원값을 보정하지 않습니다.

[ICC 기반 계층](icc-structure.md)은 PNG 압축과 독립적이며 헤더·extent·ID·태그/배치 책임을 분리합니다. [독립 검증 기록](icc-verification.md)에서 구조 검사와 미구현 의미 검증의 경계를 관리합니다. [PNG 프로파일 검사](png-profile-inspection.md)는 픽셀 검사 순회에 연결되어 있으며, 색상 변환·프로파일 우선순위 결정과는 구분합니다.

XML 공통 문자 입력은 [XML 입력 계약](xml-input.md)에 분리합니다. HWP5 원시 문자열 보존과 정책이 다르며, XML 문법·HWPML/HWPX 모델 검증으로 자동 승격하지 않습니다.

[HWPX ZIP 컨테이너 경계](hwpx-zip-container.md)는 `src/zip/`의 일반 ZIP 인덱스·해제와 `src/hwpx/`의 mimetype 식별을 분리합니다. [패키지 관계](hwpx-package-relationships.md)는 공통 XML 태그/namespace 순회를 재사용해 OCF 루트와 OPF manifest/spine을 연결합니다. [버전 XML](hwpx-version.md), [암호화 분류](hwpx-protection.md), [header·spine 구조](hwpx-document-structure.md), [header 리소스 ID 색인](hwpx-header-resources.md), [section 서식 참조](hwpx-section-references.md), [header 내부 서식 참조](hwpx-header-references.md), [언어별 글꼴 ID 참조](hwpx-font-references.md), [번호·글머리표 내부 참조](hwpx-list-references.md), [이진 리소스 manifest 연결](hwpx-binary-references.md), [차트 ZIP 경로·XML 경계](hwpx-chart-references.md)는 각각 독립 계약이며, 나머지 header/section 내부 참조와 공통 문서 모델 조립은 후속 계층입니다.

[Adobe APP14 4성분 JPEG](jpeg-adobe-four-component.md)는 구조·색 선언을 해석하는 Exif 경로와 재사용 평면 샘플링/색 산술을 분리합니다. HWPX 보고서는 선택과 예산만 맡고 색 공식·ICC 의미를 복제하지 않습니다.

[PNG RGBA 픽셀 조립](png-rgba.md)은 기존 청크/IDAT/행 복원과 출력 좌표 배치를 분리합니다. 선택적 [HWP5 BinData](hwp5-bin-data-png-rgba.md)·[HWPX ZIP 이미지](hwpx-png-rgba.md) 연결은 대상 선택·예산·보고만 소유하고, 색 깊이 축소·투명도 비교·Adam7 배치는 공통 이미지 계층만 소유합니다.

[XML 네임스페이스 버전 경계](hwpx-namespace-profiles.md)는 2011 지원과 후속 OWPML 계열의 미지원 진단을 구분합니다. 숫자 버전이나 URI 모양만으로 스키마·의미 지원을 활성화하지 않습니다.

[차트 데이터 캐시 구조](hwpx-chart-cache.md)는 차트 XML 경계가 확보한 입력의 개수·인덱스·값 요소만 검사합니다. 차트 경로 해석이나 시리즈별 의미를 다시 소유하지 않습니다.

[차트 수식 참조 구조](hwpx-chart-formula.md)는 같은 XML 순회에서 참조와 캐시의 연결만 검사합니다. 수식 문자열의 의미 해석과 포인트 원값 모델 조립은 별도의 후속 책임입니다.

[차트 값·수식 텍스트 관측](hwpx-chart-text.md)은 공통 XML 본문 이벤트에서 정규화된 UTF-8 길이·빈 값을 계수합니다. 숫자·수식의 의미, 문서 모델 보존과 편집은 여전히 후속 계층입니다.

[차트 값 ST_Xstring 해석](hwpx-xstring.md)은 값 leaf에만 적용합니다. 수식과 숫자 의미 해석은 이 계층에 넣지 않습니다.

[Section 텍스트 이벤트](hwpx-section-text.md)는 spine에서 선택한 문단·run·`hp:t`의 경계와 문자 조각·내부 요소를 순서대로 노출합니다. 텍스트 모델 조립·조건부 분기·편집은 별도 책임으로 남깁니다.

[Section 텍스트 소유 스냅샷](hwpx-section-text-snapshot.md)은 같은 이벤트를 복사해 호출 수명 밖에 보존합니다. XML 스캐너 규칙이나 문서 의미 해석을 중복하지 않으며 전체 편집 모델은 후속 단계입니다.

[HWPX 수식 원문·script 검사](hwpx-equations.md)는 소유 section 트리에서 run 직접 수식만 선택합니다. [수식 도형 자식](hwpx-equation-shapes.md)은 부모 원문 안의 부분 범위를 공유하고 속성 복제를 예산에 추가합니다. [caption 목록](hwpx-equation-captions.md)은 표와 같은 직접 목록·문단 순회를 재사용하며 속성 소유 결과만 수식 보고서에 추가합니다. [shapeComment 문자열](hwpx-equation-comments.md)은 script와 같은 section 문자 순회를 공유하되 별도 모듈에서 직접 텍스트만 소유합니다. 수식 문법·조판은 별도 후속 책임으로 둡니다.

[Section 파라미터 원값 트리](hwpx-parameter-lists.md)는 도형별 검사기와 독립적으로 소유 section 트리의 `parameterset`과 `fieldBegin/parameters`를 공통 재귀 검사기로 순회합니다. 기존 수식·표 원문 보고서에 파라미터 값을 복제하지 않고, 상위 Document/XmlTrees API가 공통 검사기를 호출합니다. 값의 응용 의미와 저장은 후속 계층입니다.

[Section metaTag 직접 텍스트](hwpx-meta-tags.md)는 부모가 fieldBegin·수식·도형 중 무엇이든 같은 section 트리 문자 이벤트에서 정확한 `hp:metaTag`만 선택합니다. 수식·표 자식 보고서는 원문을 유지하고, 별도 보고서가 정규화된 직접 텍스트를 소유합니다. 표시·JSON·편집 의미는 별도입니다.

[Section indexmark·dutmal 문자열 컨트롤](hwpx-inline-string-controls.md)은 같은 section 트리와 직접 텍스트 누적기를 재사용해 두 컨트롤의 정확한 자식 문자열과 원문 속성을 소유합니다. 인덱스 생성·덧말 배치 및 style ID 연결은 여기서 임의로 구현하지 않습니다.

[Section 필드 시작·끝 마커](hwpx-field-markers.md)는 section 트리에서 어휘·직접 자식·원문을 소유하고, 별도 연결기가 `beginIDRef`만으로 같은 section의 시작과 끝을 짝짓습니다. 필드 내용 평가·표시·저장은 후속 계층이며, `parameters`와 `metaTag` 내부 값은 기존 공통 검사기의 단일 책임으로 남깁니다.

[Section 단 설정 원값](hwpx-column-definitions.md)은 section 트리의 `colPr`와 직접 `colLine`·`colSz`를 순서대로 보존하며 공개 모델 밖의 실물 enum은 진단으로 구분합니다. 선 종류·폭 어휘는 각주/미주 구분선과 공유하고, 단별 실제 폭 조판이나 편집·저장은 후속 계층입니다.

[Section 번호 컨트롤 원값](hwpx-number-controls.md)은 `autoNum`·`newNum`·`pageNum`과 직접 `autoNumFormat`을 구조·속성 단위로 보존합니다. 번호 증가·재시작·쪽 표시 결과는 후속 문서 모델의 책임이며 원값 검사 성공으로 추론하지 않습니다.

[각주·미주 본문 경계](hwpx-note-bodies.md)는 `footNote`·`endNote`의 숫자 원값과 직접 `subList`·직접 문단을 보존하고 공통 ParaListType 속성 판정을 재사용합니다. 앞의 번호 컨트롤과 실제 번호·위치·표시 순서를 연결하는 의미 계층은 별도 후속 단계입니다.

[각주·미주 원문 위치](hwpx-note-sites.md)는 같은 주석 보고서의 독립 필드로 가장 가까운 문단·run·목록 조상 및 원본 XML 바이트 오프셋을 보존합니다. 표시·편집 위치로 변환하지 않습니다.

[각주·미주 텍스트 소유](hwpx-note-text.md)는 같은 section 트리의 순서 있는 XML 문자 순회에서 가장 가까운 주석과 `hp:t`를 연결합니다. XML 디코딩을 재구현하거나 표시 문자를 합성하지 않습니다.

[각주·미주 안 번호 관계](hwpx-note-number-links.md)는 두 결과를 같은 section 트리의 부모 요소 인덱스로 연결해 포함 관계와 `numType` 일치만 관측합니다. 표시 번호·증가/재시작·쪽 배치의 의미 계층은 여전히 후속 단계입니다.

[공통 XML part 트리](hwpx-header-tree.md)는 header·section의 원문·요소 인덱스를 한 구현으로 소유합니다. [Section 원문·요소 인덱스](hwpx-section-tree.md)는 spine 선택을, header 트리는 정확한 manifest 선택과 암호화 거부를 적용합니다. 미지원 요소까지 남기되 텍스트 이벤트를 전체 문서 모델로 오인하지 않도록 의미 계층을 단계적으로 조립합니다.

[문서 XML 트리 조립](hwpx-document-trees.md)은 구조 검사 결과를 한 번 확정하고 header·모든 section의 소유 트리를 spine 순서로 묶습니다. 전체 바이트·요소 예산과 실패 원자성을 조립 계층에서 소유하되, 구조·원문 파싱과 미지원 part의 의미 해석을 복제하지 않습니다.

[문단 메타 속성 검사](hwpx-paragraph-metadata.md)는 소유 section 트리에서 문단의 정수·Boolean 원값 적합성과 부재 진단만 담당합니다. 서식 참조 해석·문단 자식 순서·편집 기본값을 재구현하지 않습니다.

[문단 직접 자식 구조](hwpx-paragraph-children.md)는 같은 section 트리의 `hp:p`에서 `run`·`linesegarray`·미등록 직접 요소만 분류합니다. 속성 값과 run 내부 내용은 기존 검사기가 소유합니다.

[문단 줄 조각](hwpx-line-segments.md)은 직접 `linesegarray` 아래 `lineseg` 아홉 원값과 부재·추가 자식을 진단합니다. 이 숫자를 페이지 배치로 변환하지 않습니다.

[마스터페이지 문단 줄 조각](hwpx-master-line-segments.md)은 파트·subList 선택만 별도 순회하고 아홉 필드의 판정은 section과 공유합니다. 조판 의미는 부여하지 않습니다.

[마스터페이지 문단 직접 자식](hwpx-master-paragraph-children.md)은 파트·subList 선택만 별도 순회하고 run·`linesegarray`·기타 직접 자식의 판정은 section과 공유합니다.

[Header 시작 번호](hwpx-header-begin-numbers.md)는 소유 header 트리의 직접 `beginNum` 원값과 부재 진단만 담당합니다. 번호 배정·레이아웃·재저장 규칙은 후속 문서 모델의 책임입니다.

[HWPX 쪽 설정 원값](hwpx-page-geometry.md)은 소유 section 트리의 직접 `secPr/pagePr/margin` 치수·방향·여백을 관측합니다. 쪽 배치와 저장 규칙은 후속 모델의 책임입니다.

[HWPX 구역 정의](hwpx-section-definitions.md)는 `secPr` 자체의 속성 원값·부재와 직접 자식 분포를 소유합니다. 쪽 설정·마스터페이지 참조의 내부 의미를 복제하지 않습니다.

[현재 지원 검사 묶음](hwpx-known-inspections.md)은 기존 HWPX 검사들의 결과를 같은 문서에서 모으는 경계입니다. 개별 파서 SSOT를 유지하며 미지원 문서 의미를 검증 완료로 승격하지 않습니다.

[표 격자 구조](hwpx-table-geometry.md)는 소유 XML 트리 위에서 표·행·셀 주소와 병합 범위의 점유를 진단합니다. 셀 내용·서식·레이아웃·편집은 별도 후속 계층입니다.

[표 자체 속성](hwpx-table-attributes.md)은 격자가 고른 `hp:tbl`에서 열거형·Boolean·수치 원값을 읽고, 전체 문서 경로에서만 기존 header 테두리 ID 색인에 연결합니다. 표 크기·행열 격자 정책과 셀 속성 판정은 중복하지 않습니다.

[표 안쪽 여백·셀 구역](hwpx-table-children.md)은 같은 표의 직접 자식만 선택해 여백 필드와 구역 좌표·테두리 ID를 검사합니다. 격자 선언과 공통 XML·ID 규칙을 재사용하되 배치 의미는 부여하지 않습니다.

[표 상속 shape 필드·자식](hwpx-table-shape.md)은 같은 표의 기본 shape 원값과 직접 자식 topology를 별도 보고서로 검사하고, caption 목록 속성은 기존 ParaListType 판정을 재사용합니다. 공개 모델 enum과 실제 문서 확장값을 구분하며 배치·기본값은 판정하지 않습니다.

[표 행·셀 직접 자식 topology](hwpx-table-child-topology.md)는 기존 격자가 선택한 행·셀에서 모델 밖 자식·속성과 알려진 자식의 실제 순서를 관측합니다. 순서를 XSD 규칙으로 승격하지 않고 필드·격자 소유권도 중복하지 않습니다.

[표 셀 크기·여백·속성·테두리 참조](hwpx-table-cell-fields.md)는 같은 직접 셀 선택을 재사용해 크기·여백·속성의 표기를 구분합니다. 전체 문서 검사에서만 이미 읽은 header 리소스 ID 목록을 주입해 공통 참조 판정기에 연결합니다. 음수 여백과 상위 비트 값의 화면상 해석은 확정하지 않습니다.

[표 셀 직접 subList](hwpx-table-cell-sublists.md)는 같은 셀 선택에서 목록 경계·직접 문단을 세고 [ParaListType](hwpx-para-list.md)의 필드 판정을 색인된 section 트리에 재사용합니다. 문단 메타 값은 기존 section 전체 검사가 소유하며 셀 본문의 의미 조립은 아직 별도 단계입니다.

[모든 ZIP 엔트리 바이트 무결성](hwpx-payload-integrity.md)은 기존 ZIP 해제·CRC 계약을 전체 archive에 적용합니다. OPF 밖 항목도 누락하지 않지만 media-type과 payload 내부 포맷의 의미 검사는 해당 리소스 계층에 남깁니다.

[OPF 선언 XML 전수 문법 검사](hwpx-manifest-xml.md)는 공통 XML 순회를 모든 내장 `application/xml` manifest 항목에 적용합니다. settings·masterpage도 포함하지만 루트별 스키마·의미는 해당 후속 계층에 남깁니다.

[settings.xml 원값 검사](hwpx-settings.md)는 manifest의 정확한 항목을 선택하고 Caret·config 원값과 지원되는 수치/Boolean 어휘만 확인합니다. 문서 참조 및 설정 동작 의미는 조립 후속 계층에 남깁니다.

[masterpage 파트·section 참조](hwpx-master-pages.md)는 정규 manifest 파트의 루트 속성과 `hp:masterPage/@idRef` 연결을 분리해 확인합니다. 직접 자식 `hp:subList`의 원값·직접 문단 경계는 [ParaListType 속성](hwpx-para-list.md)이, 그 아래 모든 문단의 메타 속성은 [공통 문단 규칙](hwpx-paragraph-metadata.md)이 소유합니다. 페이지 적용 규칙은 후속 계층에 남깁니다.

[마스터페이지 문단·run 서식 참조](hwpx-master-style-references.md)는 section과 같은 속성→header 테이블 판정을 재사용하되 선택 범위와 XML 바이트 한도는 별도로 소유합니다. 페이지 적용과 본문 의미는 후속 계층입니다.

[선택 분기 마스터페이지 서식 참조](hwpx-selected-master-style-references.md)는 section과 공통 스트리밍 분기 상태를 공유하고 활성 문단·run에 기존 ID 판정을 적용합니다. 원문 보고서와 페이지 적용 의미는 바꾸지 않습니다.

[마스터페이지 텍스트 이벤트](hwpx-master-text.md)는 section의 토큰 스캐너를 공유하고 마스터페이지 파트 선택·직접 `subList` 범위·XML 예산만 분리합니다. 페이지 적용/표시 의미는 여기서 만들지 않습니다.

[마스터페이지 텍스트 소유 스냅샷](hwpx-master-text-snapshot.md)은 같은 이벤트를 section의 소유 복사 빌더에 전달합니다. 파트 선택과 scanner의 SSOT를 유지하며 표시·편집 의미를 추가하지 않습니다.

[마스터페이지 이진 리소스 참조](hwpx-master-binary-references.md)는 header/section과 동일한 OPF ID 색인·XML 개체 분류를 재사용하면서 파트 선택·직접 `subList` 범위·예산·결과를 분리합니다. 바이너리 payload 의미는 별개입니다.

[그림 이미지 연결](hwpx-picture-image-links.md)은 section과 마스터페이지 원문 XML 트리의 직접 `pic/img` 사이트를 공통 OPF ID 해결 규칙에 연결합니다. 마스터페이지 XML 트리 생성은 브러시·그림 연결이 같은 소유 모듈을 재사용하며, 이미지 내용 해석은 별도 후속 책임입니다.

[그림 이미지 바이트 검사](hwpx-picture-image-payloads.md)는 이미 해결된 사이트를 공통 `image_payloads.zig`에 전달합니다. 브러시·그림의 ZIP/시그니처/한도 규칙을 중복하지 않으며, 이미지 내용의 미지원 형식과 부분 검사 깊이는 각 대상 결과에 명시합니다.

[마스터페이지 차트 경로·XML 검사](hwpx-master-chart-references.md)는 section의 차트 경로 스캐너와 대상 Resolver를 재사용하고, 마스터페이지 직접 `subList` 범위와 별도 예산·보고서만 소유합니다. 기본 원문과 명시적 선택 분기를 구분합니다.

[마스터페이지 표 격자](hwpx-master-table-geometry.md)는 같은 파트 선택·직접 `subList` 경계를 사용하고 section의 표·셀 필드 판정에 위임합니다. 별도 표 파서를 두지 않습니다.

[선택 분기 표 격자](hwpx-selected-table-geometry.md)는 스트리밍 스캐너의 조건부 선택 정책을 소유 XML 트리에 적용한 뒤 동일한 section·마스터페이지 표 판정을 호출합니다. 원문 양쪽 분기 보고서는 바꾸지 않습니다.

[Run 변경 추적 ID 원값](hwpx-run-metadata.md)은 section과 마스터페이지에서 `charTcId`·대체 `paraTcId`를 같은 필드 검사기로 관측합니다. 부재·0·양쪽 값 충돌을 보존하며 변경 추적의 의미나 기본값 결정은 후속 계층에 남깁니다.

[Run 위치·직접 자식 진단](hwpx-run-topology.md)은 같은 두 범위의 부모·자식 관계와 `secPr` 위치를 별도 순회에서 관측합니다. 2021 스키마 순서를 2011 문서에 강제하지 않고 미등록 자식을 진단으로 보존합니다.

[조건부 switch 구조](hwpx-switch-shape.md)는 직접 run 자식의 case/default 모양과 요구 namespace 원값을 관측합니다. 실제 분기 선택은 명시적 지원 프로필이 정해진 후속 계층에 남깁니다.

[`hp:t` 원값·직접 자식 진단](hwpx-text-nodes.md)은 선택적 `charStyleIDRef`의 어휘·부재와 직접 내부 요소를 별도로 관측합니다. 문자 순서·표시 의미는 section 콘텐츠 계층, 서식 적용은 후속 문서 모델의 책임입니다.

[`hp:tab` 속성 진단](hwpx-inline-tab.md)은 text 노드가 고른 직접 자식의 세 속성 형식을 별도 검사기로 분리합니다. 숫자형과 XSD 이름형을 섞지 않으며 탭의 실제 간격 계산은 후속 계층에 남깁니다.

[인라인 주석 마커 속성](hwpx-inline-annotations.md)은 같은 직접 자식 범위에서 색상·Boolean 원값만 검사합니다. 시작/끝의 짝 관계와 표시 효과는 이 계층의 책임이 아닙니다.

[인라인 변경 추적 태그](hwpx-track-change-tags.md)는 같은 범위에서 네 태그의 ID·Boolean 원값만 진단합니다. 변경 쌍과 문단 범위·변경 적용은 후속 문서 모델의 책임입니다.

[Section 직접 문자 콘텐츠·순서형 이벤트](hwpx-section-content.md)는 소유 원문을 다시 파싱해 문자·CDATA 조각을 인덱스의 정확한 부모 요소에 연결하고, 요소 경계와 문자를 원래 순서로 전달합니다. 의미 계층은 이 순회와 원문·요소 인덱스를 재사용하며 표시 문장이나 편집 모델을 임의 조립하지 않습니다.

이미지/XML 외부에서도 재사용할 수 있는 언어 태그 규칙은 `src/text/`에 둡니다. [BCP 47 문법 검사](bcp47-syntax.md)와 [IANA 등록 검증](bcp47-registry.md)은 다른 단계입니다. [PNG iTXt](png-international-text.md)는 등록 검사와 UTF-8·압축 검사를 조립하며 extension 의미 보류를 별도로 보고합니다.

바이트 리더와 CFB 읽기·strict 검증·새 컨테이너 쓰기를 구현했습니다. CFB의 각 책임은 개별 파일로 나누며, `reader.zig`는 소유권과 처리 순서를 조립합니다. 상세 API와 검증 범위는 [CFB 읽기·쓰기](cfb-reader.md)를 참고하세요.

[EMF+ Object 계층](emf-plus-object-record.md)은 Flags 해석, 분할 객체 총량, 64슬롯 Object Table 수명만 소유합니다. 개별 Brush/Pen/Path 등의 payload 파서가 이 규칙을 복제하지 않으며, 완성 객체의 바이트 조립과 타입별 의미 검증은 후속 계층으로 분리합니다.

[EMF+ SerializableObject 계층](emf-plus-serializable-object.md)은 GUID packet 분류, 효과 parameter block, record envelope를 세 파일로 분리합니다. 효과별 필드 규칙은 image_effect에만 두고 stream은 검증 결과 집계만 담당합니다.

[EMF+ 객체 공통 값 계층](emf-plus-common-objects.md)은 GraphicsVersion signature, floating geometry와 transform, Brush/Wrap 값, gradient 보조 객체를 소유합니다. Header와 후속 객체 parser는 이 규칙을 재사용합니다. Brush별 flag 조합, 중첩 Path/Image, Object Table 수명은 이 계층에 섞지 않습니다.

[EMF+ drawing PointData 절대 좌표 계층](emf-plus-point-resolution.md)은 공용 borrowed PointData iterator 위에서 첫 PointR을 원점 기준으로, 이후 delta를 직전 위치 기준으로 누적합니다. 정수 결과는 i64로 유지하고 PointF 원비트는 보존하며 wire parser나 record별 replay에 누적 규칙을 복제하지 않습니다.

[EMF+ polyline·polygon 선분 계층](emf-plus-polyline-geometry.md)은 절대 PointData의 인접점을 allocation-free segment로 연결합니다. DrawLines는 L을 닫힘 정책으로 전달하고 FillPolygon은 항상 마지막→첫 경계를 추가합니다. [Device segment 계층](emf-plus-polyline-device-segments.md)은 공용 resolved→PointF와 world/page/device mapper로 두 endpoint를 변환하며 clip·stroke/fill은 섞지 않습니다.

[EMF+ 연결 cubic Bézier 계층](emf-plus-bezier-geometry.md)은 첫 4점과 이후 3점씩을 segment로 조립하고 앞 end를 다음 start로 공유합니다. wire parser의 최소 Count 4 수용과 geometry의 완전한 `1+3n` 요구를 분리하며 불완전한 후행 점을 버리지 않습니다.

[EMF+ cardinal spline span 계층](emf-plus-cardinal-spans.md)은 DrawCurve의 Offset·NumSegments가 선택하는 인접 endpoint와 닫힌 두 curve record의 마지막→첫 연결을 조립합니다. span은 spline이 통과하는 점의 topology만 나타내며 Tension 기반 tangent/control point 계산과 렌더링은 별도 후속 계층입니다.

[EMF+ cardinal device span 계층](emf-plus-cardinal-device-spans.md)은 기존 open/closed span의 두 통과점을 일반 world·page·device mapper에 연결합니다. record 선택·topology·상대좌표·좌표 산술을 복제하지 않으며 Tension 기반 control point와 렌더링은 후속 책임입니다.

[EMF+ Path 계층](emf-plus-path-object.md)은 Integer7/15, 세 point wire 표현, 일반/RLE point type과 Path envelope를 분리합니다. 공식 R flag 결합 해석과 독립 RLE 호환 해석은 명시적 option으로 구분하며 자동 휴리스틱을 사용하지 않습니다. 상위 Brush/Region/CustomLineCap은 이 parser를 재사용하고 geometry·type 규칙을 복제하지 않습니다.

[EMF+ Path geometry 계층](emf-plus-path-geometry.md)은 좌표와 일반/RLE point type을 함께 소비해 figure별 Move·Line·cubic Bézier command를 조립합니다. PointR 누적은 공용 resolver, RLE B와 중첩 flags 보존은 geometry iterator, 렌더링·clip/fill/stroke는 후속 계층이 소유합니다.

[EMF+ Path device command 계층](emf-plus-path-device-commands.md)은 Move·Line·Bézier와 빈 figure의 metadata를 보존한 채 일반 world·page·device mapper를 적용합니다. device TypedPoint·Line·Bézier mapping의 SSOT로서 segment 계층도 같은 타입과 변환을 재사용합니다.

[EMF+ Path device marker point 반복자](emf-plus-path-device-marker-points.md)는 원본 device command에서 marker가 설정된 Move·Line 끝점·Bézier control/end point의 좌표, 역할과 원본 index를 반환합니다. 평탄화 point나 closure point를 marker로 취급하지 않습니다.

[EMF+ Path device figure geometry](emf-plus-path-device-geometry.md)는 device command를 figure별 Move·source point range·drawable command range·닫힘 상태로 색인하고 소유합니다. 원래 command metadata를 그대로 보존하며 closure edge나 평탄화 point를 발명하지 않습니다.

[EMF+ Path device figure polyline](emf-plus-path-device-polyline.md)은 figure geometry의 Line과 공용 cubic flattener를 조립해 결과 point range를 소유합니다. Move·endpoint metadata와 control metadata가 든 원본 command snapshot을 함께 보존하며 closure·stroke·fill 정책은 적용하지 않습니다.

[EMF+ Path device boundary polyline](emf-plus-path-device-boundary-polyline.md)은 figure polyline에 stroke의 명시적 closure와 fill의 명시적·암묵적 closure를 구분해 적용합니다. Move-only figure와 퇴화 closure를 보존하며 stroke/fill/rasterization 자체는 수행하지 않습니다.

[EMF+ Path device boundary edge iterator](emf-plus-path-device-boundary-edges.md)는 boundary polyline을 allocation-free Move·Edge 이벤트로 투영하고 평탄화 endpoint, 원본 endpoint, 명시적·암묵적 closure 역할과 원본 metadata를 보존합니다. closure 정책과 좌표를 다시 계산하지 않으며 실제 stroke/fill은 후속 책임입니다.

[EMF+ Path device 원본 point 반복자](emf-plus-path-device-source-points.md)는 command의 다섯 역할과 원본 index를 한 번만 계산합니다. [marker](emf-plus-path-device-marker-points.md)와 [DashMode flag](emf-plus-path-device-dash-points.md) 반복자는 이를 필터링하며, flag 위치를 실제 Pen dash/marker 재생 규칙으로 해석하지 않습니다.

[EMF+ Path closing segment 계층](emf-plus-path-segments.md)은 command iterator를 재사용해 닫힌 figure의 endpoint→시작점 직선을 원래 line/Bézier 다음에 명시적으로 방출합니다. 동일 좌표 closure와 원본 segment 순서를 보존하며 fill의 암묵적 닫힘·stroke/renderer 의미는 섞지 않습니다.

[EMF+ Path fill boundary 계층](emf-plus-path-fill-segments.md)은 열린 비어 있지 않은 figure를 다음 Start 또는 EOF에서 끝점→시작점 직선으로 닫고 명시적 closure는 중복하지 않습니다. command·segment SSOT를 재사용하며 fill mode·Brush sampling·record replay는 후속 계층에 둡니다.

[EMF+ Path device segment 계층](emf-plus-path-device-segments.md)은 stroke와 fill의 공용 Line·Bézier·closure union을 일반 world·page·device mapper에 연결합니다. 좌표만 변환하고 point type·DashMode·PathMarker·CloseSubpath·RLE metadata를 보존하며 record replay와 rasterization은 후속 책임입니다.

[EMF+ RectData world·device corner 계층](emf-plus-rect-device-corners.md)은 공용 RectData를 네 역할로 한 번만 조립하고 일반 world·page·device mapper를 각 point에 적용합니다. 회전·shear를 axis-aligned rectangle로 축약하지 않으며 RectArray는 allocation-free 순서 iterator로 연결합니다. 개별 record는 이 기반을 재사용하고 곡선·stroke/fill 재생은 후속 책임입니다.

[EMF+ rectangle record device-corner 연결](emf-plus-rect-record-device-corners.md)은 FillRects·DrawRects 배열과 Fill/DrawEllipse·DrawArc·Draw/FillPie 단일 rectangle을 공용 corner 계층에 위임합니다. record는 좌표 산술을 복제하지 않으며 곡선·stroke/fill·clip·rasterization은 후속 책임입니다.

[EMF+ Ellipse affine device basis](emf-plus-ellipse-device-basis.md)는 transformed rectangle의 세 corner에서 중심과 두 2D 반축 벡터를 조립합니다. 회전·shear를 보존하고 axis-aligned bounds나 Bézier 근사로 축약하지 않으며 Draw/FillEllipse가 같은 basis를 재사용합니다. Arc/Pie의 각도 해석과 완전한 ellipse의 segment 생성은 별도 계층이 이 basis를 재사용하고, stroke/fill·clip·rasterization은 후속 책임입니다.

[EMF+ Ellipse exact conic segment 계층](emf-plus-ellipse-device-segments.md)은 affine basis를 공용 Arc segment 생성기의 0도·360도 입력으로 연결해 네 rational quadratic을 반환합니다. Draw/FillEllipse가 같은 iterator를 재사용하고 [공용 Arc polyline](emf-plus-arc-device-polyline.md)이 네 조각을 평탄화합니다. stroke/fill·clip·rasterization은 후속 책임입니다.

[EMF+ Arc/Pie affine device geometry](emf-plus-arc-device-geometry.md)는 non-negative finite StartAngle의 modulo 360, finite SweepAngle의 ±360 clamp와 방향 부호를 해석해 affine ellipse basis와 조립합니다. [Arc endpoint와 Pie radial edge](emf-plus-arc-device-points.md)는 이 geometry를 공통 삼각함수 식으로 평가하고, [Arc exact conic segment](emf-plus-arc-device-segments.md)는 최대 90도 rational quadratic span으로 조립하며, [conic evaluator](emf-plus-arc-segment-evaluation.md)는 유효한 parameter에서 homogeneous 점을 계산합니다. [공용 평탄화](emf-plus-arc-segment-flattening.md)는 동차 좌표 분할·오차/한도를 소유하고 [Arc polyline](emf-plus-arc-device-polyline.md)이 segment들을 전역 budget 아래 조립합니다. wire 원값 보존·각도 해석·점 평가·곡선 표현·근사 출력을 분리하며 stroke/fill·clip·rasterization은 후속 책임입니다.

[Pie device boundary](emf-plus-pie-device-boundary.md)는 center→start, signed Arc conic sequence, end→center를 역할이 있는 union으로 조립하고 [Pie boundary polyline](emf-plus-pie-device-polyline.md)이 같은 Arc 근사와 두 방사선을 연결합니다. zero/full sweep의 coincident radial edge도 의미상 보존하고 실제 stroke/fill·degenerate 처리·rasterization은 후속 책임입니다.

[EMF+ image parallelogram 계층](emf-plus-image-parallelogram.md)은 DrawImagePoints의 upper-left·upper-right·lower-left를 공용 resolver로 읽고 네 번째 점을 외삽합니다. 정수는 i64로 유지합니다. [image affine map 계층](emf-plus-image-affine-map.md)은 SrcRect의 네 corner를 이 destination 역할로 보내는 row-vector transform을 조립하고 공용 TransformMatrix의 점 적용을 재사용합니다. 픽셀 sampling·effect·rasterization은 후속 계층이 소유합니다.

[EMF+ DrawImagePoints source→device map 계층](emf-plus-image-source-device-map.md)은 source affine 결과에 일반 world transform과 page/device scale을 순차 적용합니다. f32 단계 순서를 보존해 행렬을 미리 합성하지 않으며 crop·sampling·effect·clip·rasterization은 후속 책임입니다.

[EMF+ DrawImage rectangle source→device map 계층](emf-plus-image-rect-device-map.md)은 공용 RectData 변환으로 destination의 세 basis 역할을 만들고 기존 image affine 및 source→device 계층에 위임합니다. rectangle 산술·affine 공식·world/page/device 순서를 복제하지 않으며 실제 image sampling과 replay는 후속 책임입니다.

[EMF+ world·page·device 좌표 계층](emf-plus-world-page-device.md)은 일반 graphics state의 world transform을 먼저 적용하고 page의 비대칭 device scale을 뒤에 적용합니다. unknown world/page는 추정하지 않으며 SetTSGraphics의 별도 WorldToDevice와 개별 geometry 순회·clip·rasterization은 후속 책임으로 남깁니다.

[EMF+ Bézier device segment 계층](emf-plus-bezier-device-segments.md)은 기존 cubic topology의 네 역할을 일반 world·page·device mapper에 연결합니다. [공용 cubic evaluator](emf-plus-cubic-evaluation.md)와 [subdivision 계층](emf-plus-cubic-subdivision.md)은 하나의 de Casteljau 중간점 SSOT로 점 평가·정확한 분할을 제공하고, [분석 계층](emf-plus-cubic-analysis.md)은 derivative와 tolerance 독립 flatness metric을 분리합니다. [adaptive flattening 계층](emf-plus-cubic-flattening.md)은 이 metric과 midpoint 분할만 조립하며 깊이·출력 한도를 소유합니다. DrawBeziers와 Path adapter는 같은 canonical cubic을 사용하며 record parser·상대좌표 누적·topology·좌표 산술을 복제하지 않습니다. Path figure polyline도 같은 flattener를 재사용하며 stroke/rasterization은 후속 책임입니다.

[연결 Bézier polyline 계층](emf-plus-bezier-device-polyline.md)은 DrawBeziers device segment들을 global point budget 아래 병합하고 공유 endpoint를 한 번만 저장합니다. Path의 figure별 polyline은 별도 계층이 공용 cubic flattener에서 조립하며 stroke/rasterization은 두 aggregate에 넣지 않습니다.

[EMF+ Image 계층](emf-plus-image-object.md)은 Image dispatch, Bitmap, indexed Palette, Metafile payload를 분리합니다. raw pixel에서만 format·stride·palette·크기를 검증하고 compressed payload와 중첩 metafile은 원문을 보존합니다. 이미지 시그니처나 바이트 모양으로 명시된 wire type을 자동 교정하지 않습니다.

[EMF+ Brush 계층](emf-plus-brush-object.md)은 다섯 BrushType dispatch와 Solid/Hatch/Linear/Path/Texture payload를 분리합니다. 선택 데이터 순서와 flag 충돌은 공통 optional 계층이 소유하고, boundary Path와 Texture Image는 기존 parser에 정확한 slice를 위임합니다. 정의됐지만 해당 brush에서 무관한 flag를 임의로 예약 비트처럼 거부하지 않으며 렌더링 의미는 이 wire 계층에 넣지 않습니다.

[EMF+ CustomLineCap 계층](emf-plus-custom-line-cap.md)은 Default/AdjustableArrow dispatch, 공통 line enum과 두 flag, 고정 payload와 중첩 Fill/Line Path를 분리합니다. signed 길이는 공통 sized Path 계층이 원자적으로 처리하고 기존 Path parser에 정확한 slice를 위임합니다. 후속 Pen/Region이 enum·길이·Path 규칙을 복제하지 않습니다.

[EMF+ Pen 계층](emf-plus-pen-object.md)은 enum·flag, count-prefix float 배열, size-prefix CustomLineCap, flag 순서 PenData와 최상위 Brush 조립을 분리합니다. PenData가 소비한 위치가 Brush 경계의 SSOT이며 기존 Transform·line enum·CustomLineCap·Brush parser에 exact slice를 위임합니다.

[EMF+ Region 계층](emf-plus-region-object.md)은 sparse node type, 비재귀 전위 순회 트리 검사와 최상위 count/version 조립을 분리합니다. `RegionNodeCount + 1`과 실제 노드 수·완성된 이진 트리를 함께 대조하고 Rect·signed-size Path 해석은 기존 geometry·sized Path 계층에 위임합니다.

[EMF+ StringFormat 계층](emf-plus-string-format-object.md)은 enum·flags·LCID, signed CharacterRange view, count 기반 가변 배열과 60바이트 최상위 헤더를 분리합니다. 가변부 크기 산술과 TabStops/CharRange 경계는 StringFormatData가 한 번만 계산하며 상위 객체는 그 결과를 재사용합니다.

[EMF+ Font 계층](emf-plus-font-object.md)은 Pen과 공유하는 UnitType, FontStyle flags와 Length 기반 UTF-16 family name 조립을 분리합니다. 이름은 공통 UTF-16 scalar 검사를 재사용하고 Reserved와 객체 정렬 바이트를 손실 없이 보존합니다.

[EMF+ ImageAttributes 계층](emf-plus-image-attributes-object.md)은 Brush와 공유하는 WrapMode, signed ObjectClamp domain과 24바이트 고정 객체 조립을 분리합니다. ignored Reserved와 Clamp 이외 모드의 ClampColor도 원문으로 보존하며 렌더링 조건을 wire parser에 섞지 않습니다.

[EMF+ Clear record 계층](emf-plus-clear-record.md)은 정확한 고정 record 크기와 공통 ARGB Color만 해석하고 stream은 검증된 record 수만 집계합니다. ignored Flags를 보존하며 실제 surface 상태 변경은 wire parser에 넣지 않습니다.

[EMF+ FillRects record 계층](emf-plus-fill-rects-record.md)은 공용 BrushId/ARGB 선택과 RectArray를 조립하고 stream은 조건부 Brush 참조만 연결합니다. rectangle fill 재생은 wire parser와 분리합니다.

[EMF+ FillPolygon record 계층](emf-plus-fill-polygon-record.md)은 공용 BrushId/ARGB와 P/C PointData를 조립하고 stream은 조건부 Brush 참조만 연결합니다. 상대좌표 누적과 닫힌 경계 선분은 공용 geometry 계층에 두고 polygon fill 재생은 wire parser와 분리합니다.

[EMF+ FillEllipse record 계층](emf-plus-fill-ellipse-record.md)은 공용 BrushId/ARGB와 C별 RectData를 조립하고 stream은 조건부 Brush 참조만 연결합니다. Rect/RectF 선택·좌표 배치를 복제하지 않으며 ellipse fill 재생은 wire parser에 넣지 않습니다.

[EMF+ FillPie record 계층](emf-plus-fill-pie-record.md)은 공용 BrushId/ARGB와 DrawArc·DrawPie가 공유하는 ArcData를 조립하고 stream은 조건부 Brush 참조만 연결합니다. 각도 modulo·clamp와 pie fill 재생은 wire parser에 넣지 않습니다.

[EMF+ FillRegion](emf-plus-fill-region-record.md)과 [FillPath record 계층](emf-plus-fill-path-record.md)은 동일한 고정 envelope·Flags ObjectId·BrushId/ARGB를 공통 Fill-object 모듈에서 해석하고 각 wrapper는 대상 이름만 부여합니다. stream은 대상 객체와 조건부 Brush 참조만 연결하며 기존 Region tree·Path geometry를 다시 해석하거나 fill 재생을 수행하지 않습니다.

[EMF+ FillClosedCurve record 계층](emf-plus-fill-closed-curve-record.md)은 Brush와 W fill mode를 조립하고 DrawClosedCurve와 공유하는 Tension·Count·PointData는 공통 closed-curve-data 모듈에서 해석합니다. stream은 조건부 Brush 참조만 연결하며 spline 계산과 alternate/winding fill 재생은 wire parser에 넣지 않습니다.

[EMF+ DrawArc record 계층](emf-plus-draw-arc-record.md)은 drawing record 공용 C/ObjectID flags, Rect/RectF 선택과 두 각도를 분리합니다. stream은 기존 Object Table에서 Pen 존재·타입을 확인하고 payload parser는 렌더링 modulo·clamp를 수행하지 않습니다.

[EMF+ DrawBeziers record 계층](emf-plus-draw-beziers-record.md)은 Path와 공유하는 Point/PointR iterator 위에서 P/C별 PointData를 선택합니다. stream은 Pen 참조만 연결하며 상대좌표 누적과 연결 cubic topology는 공용 geometry 계층, 단일 parameter 점은 공용 cubic evaluator, flattening·stroke는 후속 renderer 계층에 둡니다.

[EMF+ DrawClosedCurve record 계층](emf-plus-draw-closed-curve-record.md)은 FillClosedCurve와 공통인 Tension·최소 Count 3·PointData 위에 Pen 참조를 조립합니다. stream은 Pen 참조만 연결하며 닫힌 span topology는 공용 geometry 계층, cardinal tangent·곡선 평가는 후속 renderer 계층에 둡니다.

[EMF+ DrawCurve record 계층](emf-plus-draw-curve-record.md)은 C별 절대 PointData에 Tension·Offset·NumSegments와 최소 Count 2를 조립합니다. reserved bit를 상대 좌표 flag로 오인하지 않고 wire parser는 재생 범위를 추정하지 않으며, 공용 geometry 계층이 실제 span 범위를 검증합니다.

[EMF+ DrawDriverString record 계층](emf-plus-draw-driver-string-record.md)은 Font ObjectID와 S별 Brush/ARGB, 네 option, glyph·PointF 배열과 선택 행렬을 조립합니다. 홀수 glyph의 내부 비정렬 배치를 자동 보정하지 않고 record 끝 정렬만 분리하며 glyph shaping과 재생 의미는 wire parser에 넣지 않습니다.

[EMF+ DrawEllipse record 계층](emf-plus-draw-ellipse-record.md)은 공용 C/ObjectID와 RectData를 조립하고 stream은 Pen 참조만 연결합니다. Rect/RectF 선택·좌표 배치를 복제하지 않으며 ellipse 재생은 wire parser에 넣지 않습니다.

[EMF+ DrawImage record 계층](emf-plus-draw-image-record.md)은 Image와 optional ImageAttributes ID, Pixel SrcUnit, source RectF와 C별 destination RectData를 조립합니다. optional ID의 raw/null 정책은 다음 DrawImagePoints와 공유하고 stream은 조건부 객체 타입만 연결하며 crop·scale·효과 적용은 wire parser에 넣지 않습니다.

[EMF+ DrawImagePoints record 계층](emf-plus-draw-image-points-record.md)은 DrawImage의 공통 ID·source 필드와 P/C별 PointData, 정확한 Count 3, E 효과 요구를 조립합니다. stream은 앞선 SerializableObject와 객체 타입을 연결하고 상대좌표 누적·destination parallelogram·SrcRect affine mapping은 공용 geometry 계층을 재사용하며, image sampling과 재생은 후속 계층에 둡니다.

[EMF+ DrawLines record 계층](emf-plus-draw-lines-record.md)은 P/C별 PointData, 최소 Count 2와 L 닫힘 flag를 조립합니다. stream은 Pen 참조만 연결하고 PointR 누적과 L 닫힘 선분은 공용 geometry 계층, stroke 재생은 후속 renderer 계층에 둡니다.

[EMF+ DrawPath record 계층](emf-plus-draw-path-record.md)은 고정 payload의 Pen ID와 Flags의 Path ObjectID를 분리합니다. stream은 기존 두 Object Table 슬롯과 타입만 연결하고 Path geometry·stroke 재생은 기존 Path 객체 parser와 후속 렌더러의 책임으로 둡니다.

[EMF+ DrawPie record 계층](emf-plus-draw-pie-record.md)은 DrawArc와 동일한 angle·RectData payload를 공용 ArcData에서 재사용하고 record envelope와 Pen 참조만 별도로 조립합니다. modulo·clamp와 pie stroke 재생은 wire parser에 넣지 않습니다.

[EMF+ DrawRects record 계층](emf-plus-draw-rects-record.md)은 Count·C별 고정폭 RectData 배열을 공용 RectArray에 분리하고 record envelope와 Pen 참조만 조립합니다. iterator는 입력을 빌리며 좌표 의미와 rectangle stroke 재생은 wire parser에 넣지 않습니다.

[EMF+ DrawString record 계층](emf-plus-draw-string-record.md)은 Font·조건부 Brush·선택 StringFormat 참조와 UTF-16LE StringData를 조립합니다. optional u32 ObjectID 해석은 DrawImage의 ImageAttributes와 공유하고, shaping·layout·CharacterRange 교차 검증은 wire parser와 타입 전용 Object Table 상태에 넣지 않습니다.

[EMF+ SetRenderingOrigin property 계층](emf-plus-set-rendering-origin-record.md)은 고정 signed x/y wire 값과 record envelope를 검증합니다. stream의 상태 적용과 Save/Restore 재생은 parser와 분리한 공용 property 상태가 담당합니다.

[EMF+ SetAntiAliasMode property 계층](emf-plus-set-anti-alias-mode-record.md)은 Flags의 A, SmoothingMode와 reserved bits를 분리하고 정의된 enum domain을 전용 값 모듈에서 검증합니다. 실제 rasterization과 state replay는 wire parser에 넣지 않습니다.

[EMF+ SetTextRenderingHint property 계층](emf-plus-set-text-rendering-hint-record.md)은 Flags low byte의 TextRenderingHint와 high-byte reserved 영역을 분리하고 공식 예제와 enum domain을 검증합니다. glyph rendering은 wire parser에 넣지 않습니다.

[EMF+ SetTextContrast property 계층](emf-plus-set-text-contrast-record.md)은 Flags 하위 12비트의 1000–2200 gamma 값을 검증하고 상위 reserved 비트를 보존합니다. 단위가 다른 terminal-server TextContrast와 합치지 않습니다.

[EMF+ SetInterpolationMode property 계층](emf-plus-set-interpolation-mode-record.md)은 Flags low byte와 high-byte reserved 영역을 분리하고 0–7 enum 및 공식 예제를 검증합니다. 별칭 정규화와 image resampling은 wire parser에 넣지 않습니다.

[EMF+ SetPixelOffsetMode property 계층](emf-plus-set-pixel-offset-mode-record.md)은 Flags low byte와 high-byte reserved 영역을 분리하고 0–4 enum 및 공식 예제를 검증합니다. 별칭 정규화와 pixel-center rasterization은 wire parser에 넣지 않습니다.

[EMF+ SetCompositingMode property 계층](emf-plus-set-compositing-mode-record.md)은 Flags low byte와 high-byte reserved 영역을 분리하고 SourceOver·SourceCopy enum을 검증합니다. 실제 alpha blending과 합성은 wire parser에 넣지 않습니다.

[EMF+ SetCompositingQuality property 계층](emf-plus-set-compositing-quality-record.md)은 정의된 enum과 Windows invalid-value fallback을 구분해 원시값과 유효 재생값을 함께 보존합니다. 실제 gamma correction과 합성은 wire parser에 넣지 않습니다.

[EMF+ graphics property 상태 계층](emf-plus-property-state.md)은 위 여덟 record의 관측값을 optional 필드로 보존하고 tracked stream report 및 Save/Container snapshot에 연결합니다. wire 검증·enum domain은 각 전용 parser가, 상태 수명주기는 이 계층이 소유하며 실제 rasterization은 둘 모두에 넣지 않습니다.

[EMF+ BeginContainer state record 계층](emf-plus-begin-container-record.md)은 공용 RectF·UnitType 위에 두 rectangle과 StackIndex를 조립하고 SHOULD NOT 단위를 거부 오류와 분리합니다. tracked stream은 Container entry를 공용 stack에 넣되 transform replay는 wire parser에 섞지 않습니다.

[EMF+ BeginContainer transform 계층](emf-plus-container-transform.md)은 Header logical DPI와 PageUnit으로 source 단위를 환산하고 DestRect/SrcRect 행렬을 구성합니다. stream은 snapshot 뒤 기존 world transform에 prepend하며 World/Display의 불확정 상태를 명시적으로 보존합니다.

[EMF+ BeginContainerNoParams state record 계층](emf-plus-begin-container-no-params-record.md)은 Save·Restore와 같은 StackIndex wire SSOT를 재사용하고 ignored Flags를 보존합니다. tracked stream은 같은 Container entry를 사용해 공용 graphics state snapshot을 캡처합니다.

[EMF+ EndContainer state record 계층](emf-plus-end-container-record.md)은 같은 StackIndex wire SSOT와 공용 graphics-state stack을 재사용해 target과 이후 mixed entry를 제거합니다. wire 수명주기 검증과 실제 graphics snapshot 복원을 구분합니다.

[EMF+ SetTSClip terminal-server record 계층](emf-plus-set-ts-clip-record.md)은 C별 고정폭 signed delta 좌표와 NumRects/크기 envelope를 분리합니다. 일반 PointR과 반대인 marker 규칙을 공유 decoder에 섞지 않습니다. [terminal-server clip 상태](emf-plus-ts-clip-state.md)는 빌린 rectangle을 소유 배열로 물질화하고 graphics snapshot 수명주기에 연결합니다.

[EMF+ SetTSGraphics terminal-server record 계층](emf-plus-set-ts-graphics-record.md)은 36바이트 graphics state와 선택 Palette를 공용 enum·행렬·Palette 모듈 위에 조립합니다. sparse FilterType은 별도 SSOT로 두고 T/V 의미와 VGA claim은 record 계층에서 검증합니다. [terminal-server graphics 소유 상태](emf-plus-ts-graphics-state.md)는 Palette를 깊은 복사해 tracked report와 Save/Container snapshot 수명주기에 연결하며, 단위와 의미가 다른 일반 property·world transform에 병합하지 않습니다.

[EMF+ MultiplyWorldTransform transform record 계층](emf-plus-multiply-world-transform-record.md)은 공용 TransformMatrix와 record별 고정 envelope를 조립하고 A bit의 pre/post 순서를 의미별 record flag 별칭으로 해석합니다. [graphics state 계층](emf-plus-graphics-state.md)이 실제 행렬 곱셈과 snapshot replay를 소유합니다.

[EMF+ SetWorldTransform transform record 계층](emf-plus-set-world-transform-record.md)은 공용 TransformMatrix와 ignored Flags를 보존합니다. 실제 world matrix 교체는 graphics state 계층이 담당합니다.

[EMF+ ResetWorldTransform transform record 계층](emf-plus-reset-world-transform-record.md)은 payload 없는 고정 envelope와 ignored Flags 보존만 담당합니다. identity 행렬 적용은 graphics state 계층이 담당합니다.

[EMF+ TranslateWorldTransform transform record 계층](emf-plus-translate-world-transform-record.md)은 dx/dy float와 A bit의 pre/post 순서를 wire 의미로 해석합니다. 실제 translation 행렬 적용은 graphics state 계층이 담당합니다.

[EMF+ ScaleWorldTransform transform record 계층](emf-plus-scale-world-transform-record.md)은 Sx/Sy float와 A bit의 pre/post 순서를 wire 의미로 해석합니다. 실제 scale 행렬 적용은 graphics state 계층이 담당합니다.

[EMF+ RotateWorldTransform transform record 계층](emf-plus-rotate-world-transform-record.md)은 degree 단위 Angle float와 A bit의 pre/post 순서를 wire 의미로 해석합니다. 실제 rotation 행렬 적용은 graphics state 계층이 담당합니다.

[EMF+ SetPageTransform transform record 계층](emf-plus-set-page-transform-record.md)은 PageUnit과 PageScale을 해석하고 SHOULD NOT 단위를 경고 상태로 보존합니다. [page transform 재생 계층](emf-plus-page-transform.md)은 Header DPI와 공용 단위 환산으로 page-to-device scale을 만들고 graphics state snapshot에 연결합니다.

[EMF+ ResetClip clipping record 계층](emf-plus-reset-clip-record.md)은 payload 없는 고정 envelope와 ignored Flags를 보존합니다. [clipping state 계층](emf-plus-clip-state.md)이 infinity reset, 증명 가능한 CombineMode 항등식, 추상 Offset과 Save/Container snapshot을 소유합니다.

[EMF+ SetClipRect clipping record 계층](emf-plus-set-clip-rect-record.md)은 공용 RectF와 전용 CombineMode enum을 조립하고 Flags의 나머지 reserved bit를 보존합니다. 일반 geometry boolean은 clipping state에서 `complex`로 명시합니다.

[EMF+ SetClipPath clipping record 계층](emf-plus-set-clip-path-record.md)은 공용 ObjectID·CombineMode를 조립하고 stream에서 기존 Path Object 슬롯과 타입을 확인합니다. payload 미보존으로 계산할 수 없는 geometry는 clipping state에서 `complex`로 명시합니다.

[EMF+ SetClipRegion clipping record 계층](emf-plus-set-clip-region-record.md)은 공용 ObjectID·CombineMode를 조립하고 stream에서 기존 Region Object 슬롯과 타입을 확인합니다. payload 미보존으로 계산할 수 없는 geometry는 clipping state에서 `complex`로 명시합니다.

[EMF+ OffsetClip clipping record 계층](emf-plus-offset-clip-record.md)은 공용 float reader 위에 dx/dy translation을 조립하고 ignored Flags를 보존합니다. clipping state 계층은 geometry를 추측하지 않고 추상 영역 분류를 유지합니다.

[EMF+ StrokeFillPath 관측 계층](emf-plus-stroke-fill-path-record.md)은 공식 문서에 payload 정의가 없는 0x4037의 Flags와 data를 opaque 원문으로 유지합니다. current Pen/Brush/Path 배치를 추측하거나 replay 지원으로 세지 않습니다.

[EMF+ RecordType wire 지원 매트릭스](emf-plus-record-coverage.md)는 공식 58개 enum 값을 wire-validated 54개, opaque-preserved 1개, forbidden 3개로 exhaustive 분류하고 stream이 같은 정책을 사용하게 합니다. 이 분류는 graphics replay·렌더링·저장 지원률과 분리합니다.

[EMF+ GetDC interleaving 계층](emf-plus-get-dc-interleaving.md)은 GetDC 뒤 다음 EMF+ record 전까지의 classic EMF record 구간을 stream state와 framing에서 관측합니다. EMF+ carrier comment를 일반 playback record로 세지 않으며 실제 device-context replay는 후속 책임입니다.

[EMF+ Save state record 계층](emf-plus-save-record.md)은 미사용 Flags와 u32 StackIndex를 보존합니다. 실제 graphics-state stack과 Restore 매칭은 wire parser와 분리합니다.

[EMF+ Restore와 graphics-state stack 계층](emf-plus-restore-record.md)은 Save/Container 종류를 함께 표현하고 target 이후 entry 제거, world/page transform, 보수적 일반 clip, 소유 terminal-server clip과 graphics snapshot 복원, comment 원자성, allocator 소유권과 EOF closure를 담당합니다. 두 BeginContainer record와 EndContainer도 같은 stack에 연결합니다.

PNG에서 파일 전체 이름 고유성을 검사하는 [sPLT 추천 팔레트](png-suggested-palettes.md)는 소유권이 있는 별도 Collector로 분리합니다. 기존 픽셀 검사 순회에 연결하되 비할당 metadata.State에 이름 인덱스 수명을 섞지 않습니다.

```text
src/
  binary/      경계 검사·정수 읽기 (현재 구현)
  cfb/         컨테이너 읽기·검증·새 컨테이너 쓰기 (구현)
  compression/ bounded raw DEFLATE·MIT 디코더 경계 수정본 (구현)
  hwp5/        FileHeader·압축·레코드 경계·DocInfo 해석/참조 검증·본문 문단 헤더/텍스트 토큰 (구현), 문서 모델/나머지 의미 해석/쓰기 (예정)
  zip/         메모리 기반 ZIP 엔트리 읽기·제한된 해제
  hwpx/        mimetype·패키지 관계 검사 (XML 문서 모델·쓰기 예정)
  model/       문서 공통 모델과 원본 정보 보존 (예정)
  root.zig     라이브러리 진입점
  wasm/        메모리 할당·CFB 수명·엔트리·원시 섹터 ABI
  wasm.zig     ABI 모듈 등록과 버전
js/            읽기·쓰기 API·메모리 복사·엔트리/편집 모델 변환·검색·Node 파일 입력
tests/cfb/     독립 JS 기준 구현과 비교, 브라우저 검증
tests/hwp5/    테스트 전용 WASM bridge·독립 zlib/레코드 oracle·적대적 검증 5회
```

CFB에는 HWP 문단·표·글꼴 로직을 넣지 않습니다. 파일·시계·브라우저 API에 직접 의존하지 않는 메모리 기반 읽기·쓰기를 우선합니다.

`hwp5/body/paragraph_header.zig`는 문단 헤더, `control.zig`는 제어코드 분류와 너비, `text.zig`는 원본 UTF-16 단위 위치를 가진 토큰, `reader.zig`는 태그 66~72 dispatch를 담당합니다. `char_runs.zig`·`line_segments.zig`·`range_tags.zig`는 각 행 배치, `binary/record_array.zig`는 빌린 고정 폭 배열 경계, `metadata.zig`는 문단의 선언 개수·위치·글자 모양 ID 검증을 소유합니다. `control_header.zig`는 ID/속성 원본, `list_header.zig`는 명시적으로 선택하는 spec6/observed8 배치를 소유합니다.

`body/tree.zig`는 레코드 level 기반 parent/subtree_end 인덱스를 선형 시간에 만들고 노드 배열을 소유합니다. payload는 입력을 빌립니다. `paragraphs.zig`는 문단 직접 자식을 연결하고 기존 개수/참조 규칙을 호출하며, 누락 텍스트·컨트롤/리스트 보류·미해석 레코드를 보고합니다. 논리적 리스트 범위는 list_groups가 별도로 제공하며 개체 모델·렌더링 문자열은 아직 만들지 않습니다.

`paragraph_children.zig`가 직접 자식 수집/중복 검사를 소유하고 paragraphs와 `control_links.zig`가 재사용합니다. control_links는 원본 문단/텍스트/컨트롤 노드와 UTF-16 위치를 가진 순서/ID 링크 배열을 소유합니다. 토큰의 나머지 부가정보와 개별 컨트롤 의미는 추정하지 않습니다.

`column_def.zig`는 단 정의의 동일/가변 너비 payload를 해석하고 section_validation이 문단 부모와 개수를 확인합니다. 가변 너비의 u16 쌍 배열은 binary/record_array를 재사용하며 공통 spacing의 부재와 값 0을 구분합니다. 실제 단 배치 계산은 별도 단계입니다.

`list_groups.zig`는 원래 Tree를 유지하면서 같은 부모의 리스트 헤더 사이를 그룹 범위로 나타내고 직접 문단 수를 대조합니다. 중간 표/개체 레코드와 중첩 그룹을 보존합니다. 그룹 배열을 소유하며 셀/캡션 등 개체 의미는 후속 검증 책임입니다.

`control_rules.zig`는 ID와 기대 제어코드의 순수 대응표, `control_type_validation.zig`는 기존 링크의 checked/deferred 종류 검증을 소유합니다. section_def/column_def도 같은 ID 상수를 재사용합니다. 연결·종류·payload 의미 검증을 서로 완료로 대체하지 않습니다.

`object_common.zig`는 표/그리기/수식 헤더의 공통 필드와 선택 설명을 해석합니다. ControlHeader는 계속 ID/원본 속성을 보유하고, 호출자가 supports/Properties.parse로 추가 해석합니다. UTF-16 길이 읽기는 기존 utf16_string, 컨트롤 ID는 control_rules가 소유합니다. 개체의 캡션·셀·도형 자식 구조 검증과 렌더링은 이 파서에 넣지 않습니다.

`table.zig`는 태그 77의 버전별 Row Size/영역 배열, `table_cell.zig`와 `caption.zig`는 명시적 리스트 view 이후의 payload를 해석합니다. 배열 경계는 record_array를 재사용하며 zone의 두 좌표 배치는 table_zone에 한정합니다. `table_lists`는 TABLE 마커 전후의 직접 리스트를 구분하고 중첩 표/미지 레코드를 보존합니다. `table_validation.inspect(allocator, tree, options)`는 호출자가 정한 두 배치와 테두리 개수로 소유권·총 셀 수·병합 경계·영역과 참조를 검사하고 table_grid에 논리 격자 검증을 맡깁니다. 확장 꼬리·시각적 배치까지 검사했다는 뜻은 아닙니다.

`table_grid`는 표 행/열 수·Row Size와 Rectangle 배열만 받으며 Tree/CFB에 의존하지 않습니다. Rectangle.validate가 병합 경계의 SSOT입니다. 행별 시작 셀 수를 확인하고 행 경계 이벤트를 정렬한 뒤 열 기준 구간 점유를 검사합니다. 공유 경계에서 제거→추가 순서를 지키고, 비중첩을 증명한 후 넓이 합으로 완전한 격자 채움을 확인합니다. 임시 메모리는 셀+행+열 개수에 비례하며 할당자는 호출자가 주입합니다.

`CellAttributes.fromList(view)`는 선택된 공통 리스트 속성의 셀별 비트를 해석합니다. `CellExtension.parse(cell.extra)`는 호출자가 관측 확장 형식을 선택한 경우 text_width/marker/remaining을 빌려 읽습니다. 기본 Cell.parse는 확장 뷰를 자동 호출하지 않으며 임의 꼬리를 보존합니다. 확장 뷰의 성공이나 0xff 표시는 ParameterSet/필드명의 유효성 검증과 다릅니다. 실제 검사는 `cell_field.inspect(allocator, extension, parameter_options)`를 명시적으로 호출합니다.

`parameters/types.zig`는 노드/배치/제한 계약을, `parameters/parser.zig`는 prefix 파싱과 전위 순서 노드 배열 수명을 소유합니다. 문자열과 raw/extra는 입력을 빌리며 소비 길이를 반환합니다. Set ID와 item ID, 배열의 공통 ID와 wire상 ID 존재 여부를 구분합니다. 중첩은 기본 32/상한 64, 노드는 기본 100,000개로 제한합니다. 셀 이름 소비자는 root 0x021b의 직접 item 0x4000만 확인하며 임시 노드를 해제한 뒤 borrowed 이름/꼬리를 반환합니다. BinData 참조 연결과 각 레코드의 꼬리 계약은 외부 문서 조립 책임입니다.

`parameter_sources.inspectDocInfo/inspectBody`는 parameter options·list layout·DocInfo BinData 리소스 개수를 받아 각 소스를 순회합니다. 파싱된 트리는 parameter_references와 cell_field.fromDocument에서 공유한 뒤 해제합니다. 미지원 타입은 전체 payload 단위로 보류하지만 그 뒤의 소스 검사는 계속합니다. 알려진 손상/참조 오류/할당 실패는 전파합니다. reported parsed는 구조 파싱 수이며 trailing/opaque/unknown 셀 Set을 완료로 치환하지 않습니다. ControlData 소유권과 컨트롤별 Set 의미, 전체 문서/CFB 조립은 별도 책임입니다.

태그 dispatch는 용지 73·각주/미주 모양 74·쪽 테두리 75도 포함합니다. `section_def.zig`·`page_def.zig`·`note_shape.zig`·`page_border.zig`는 각 payload 배치를 소유하고 `section_validation.zig`는 트리 기반 구역 소유권/개수/참조를 검증합니다. 구역 정의 본체와 하위 레코드를 섞지 않습니다. 각주 구분선 길이는 관측 i32 배치를 기본으로 하며 spec26은 명시적으로만 선택합니다. 주석 컨트롤 연결 및 번호 ID 0은 아직 남아 있습니다.

`document/validation.zig`의 `inspectDecoded`는 헤더와 압축 해제된 DocInfo·인덱스별 구역을 받아 기존 검증기를 연결합니다. `docinfo.zig`가 확인한 리소스 개수를 `section.zig`의 문단·구역 정의·표·파라미터 참조에 전달하며 호출자가 임의 리소스 개수를 주입하지 않습니다. 구역 수/인덱스/전역 입력 한도만 새 조립 계층이 소유합니다. 구역 정의가 첫 루트 문단에 있어야 하는 규칙은 기존 section_validation에 둡니다. 파일 검색/압축 해제/BinData 스트림 조립 및 미지원 기능 검증은 이 API의 범위가 아닙니다.

`document/types.zig`의 Report는 인덱스 순서의 구역 보고서 배열을 소유하며 deinit으로 해제합니다. DocInfo 속성 extra와 ID 매핑 raw는 입력 DocInfo를 빌리므로 해당 입력의 수명을 유지해야 합니다. 임시 Tree/링크/리스트/파라미터 노드는 호출 안에서 해제하며 부분 실패에는 보고서를 반환하지 않습니다. 개별 검사기의 pending/unknown/opaque 수치를 다른 축의 성공 개수로 상쇄하지 않습니다.

`container/validation.zig`는 파일 바이트를 strict CFB로 열고 이 decoded 진입점을 호출하는 상위 어댑터입니다. CFB 원본/스트림 한도와 HWP 압축 해제 합계 한도는 별도입니다. `paths.zig`는 정확한 계층 조회와 이름 생성, `sections.zig`는 BodyText 직접 자식 수집/해제, `binaries.zig`는 DocInfo 항목으로 내부 스트림을 찾고 기존 BinData 압축 정책을 호출합니다. 이름 길이/금지 문자/대소문자 동등성은 CFB name_order를 재사용합니다. 외부 링크는 실행하지 않고 보류합니다. 모든 데이터가 raw DEFLATE라는 가정이나 손상 후 원본 fallback을 넣지 않습니다.

container Report는 document Report와 그 DocInfo backing을 소유합니다. 입력 CFB와 임시 구역/바이너리 데이터는 반환 뒤 필요하지 않습니다. 미소비 CFB 스트림은 uninspected_streams로 보고합니다. 선택적 [BinData 이미지 검사](hwp5-bin-data-images.md)는 별도 이미지 예산과 scalar 보고서를 연결하며, 다른 이미지/OLE 및 미지원 스트림의 유효성을 주장하지 않습니다. 동일 BinData 스트림을 여러 항목이 참조하면 각 항목의 압축 정책으로 검사하고 총 decode 한도도 항목별로 계산합니다.

`preview/text.zig`는 raw UTF-16LE 바이트를 빌리는 뷰와 코드 유닛/Unicode scalar/고립 서로게이트/NUL/BOM 수치를 소유합니다. 길이 접두사가 있는 DocInfo 문자열, 제어문자 문법이 있는 본문 텍스트와 별도 형식입니다. `container/preview.zig`는 루트 PrvText의 선택적 존재·kind·전역 바이트 한도만 담당하고 문서 compressed 비트와 무관하게 원문을 전달합니다. container Report의 preview_text=null과 0유닛 Stats는 부재/빈 텍스트를 구분하며, 통계만 저장하므로 임시 CFB를 해제한 뒤의 포인터를 남기지 않습니다. total_decoded_bytes에는 이 비압축 소비량도 포함합니다.

`scripts/version.zig`와 `scripts/source.zig`는 압축 해제된 입력을 빌려 두 버전 DWORD, 네 UTF-16LE 필드와 -1 종료 표식을 해석합니다. 길이는 u32 코드 유닛이며 NUL 종결·4바이트 패딩은 요구하지 않습니다. 원문과 extra를 보존하며 JS 실행기는 포함하지 않습니다. `container/scripts.zig`는 선택적인 정확한 Scripts 자식 스트림과 kind를 검사하고 기존 stream.decode를 사용합니다. 버전/소스 존재는 각각 optional이고 보고서는 scalar만 소유합니다. 디코드 바이트 전체(꼬리 포함)를 전역 한도에서 차감하며 꼬리는 trailing_bytes로 별도 보고합니다. 미지 버전을 지원 버전으로 보정하거나 스크립트 저장 플래그만으로 스트림 존재를 추정하지 않습니다.

`xml_template/`는 표 10~12의 decoded 문자열을, `container/xml_template.zig`는 선택적 파일 연결을 소유합니다. Scripts와 `utf16_string.read32`를, DocHistory와 `container/selected_encoding.zig`를 공유합니다. 선택·codec·소유권·미지원 의미와 검증 기록은 [XMLTemplate 계약](hwp5-xml-template.md)에서 관리합니다. summary의 종결·패딩 문법은 별개입니다.

`history/record.zig`는 5바이트 헤더의 독립 Iterator이며 실패 시 위치/개수를 보존합니다. `value.zig`는 태그와 다섯 공식 presence bit, 시작/버전 payload 및 raw 문자열을 소유합니다. `item.zig`는 decoded 한 항목의 STAG/ETAG와 포함 비트를 검사하고 날짜를 명시적으로 선택합니다. `last_document.zig`는 별도 최종 문서의 관측 레코드를 검사합니다. 배치·소유권·미지원 의미와 검증 기록은 [DocHistory 계약](hwp5-history-container.md)의 주제 문서에서 관리합니다. 일반 본문 framing·복호화·이력 복원 성공과 혼동하지 않습니다.

DocInfo `compatible_document.zig`와 `layout_compatibility.zig`는 각각 표 54~55의 대상 프로그램(u32 enum, 미지 값 포함), 표 56의 글자/문단/구역/개체/필드 DWORD를 해석하고 extra를 빌립니다. 공통 reader가 tag 30/31 및 level 0/1을 검사하므로 document/container에서도 같은 길이 오류가 전파됩니다. 이 두 레코드는 리소스 ID 참조를 포함하지 않아 references의 unknown_records에서는 제외되지만, 레이아웃 비트 의미·대상별 렌더링·호환성 전환은 구현하지 않았습니다.

`docinfo/compatibility_owner.zig`는 문서 조립용 상태로 가장 최근 level 0 루트만 추적합니다. layout은 compatible_document 그룹에 있어야 하며 다른 알려진/미지 루트가 나오면 해당 그룹은 끝납니다. 하위 미지 레코드는 그룹을 끝내지 않습니다. document/docinfo가 payload Iterator의 결과를 전달하므로 길이/레벨 규칙을 재구현하지 않습니다. 독립 payload 해석과 문서 전체 소유권 검사 API의 범위를 구분합니다.

`body/header_footer.zig`는 관측 CTRL_HEADER의 적용 속성과 LIST_HEADER 확장의 10바이트 텍스트 영역을 별도 borrowed payload로 해석합니다. `header_footer_validation.zig`는 이미 만들어진 Groups의 직접 부모 연결과 공통 list view를 사용합니다. 노드/정렬된 그룹을 순차 진행해 컨트롤마다 전체 그룹을 반복 검색하지 않습니다. `document/section`은 리스트 유무·영역 길이를 검사하고 결과를 SectionReport.header_footer에 보관합니다. 예약 페이지값 3과 추가 바이트를 수치로 남기며 페이지 레이아웃 성공이나 참조 비트의 대상 유효성을 보증하지 않습니다.

`body/number_control.zig`는 공통 Header를 원자적으로 읽고 Auto/Restart payload를 분리합니다. 실제 ID는 control_rules의 atno/nwno를 사용하며 요약 문서의 autn/newn 별칭을 허용하지 않습니다. Auto는 12바이트, Restart는 정의된 6바이트 필드 뒤 원문을 extra로 유지합니다. `number_control_validation.zig`는 Tree 순회로 automatic/restarted/reserved_kinds/extra_bytes를 반환하며 SectionReport.number_controls로 연결됩니다. 기존 control_links와 타입 검증은 별개로 유지하고 번호 종류 6~15는 원값/진단으로 보존합니다. shape/superscript 비트 추출은 표시 형식의 의미 검증이 아닙니다.

`summary/header.zig`는 HWP FMTID의 단일 property-set envelope만 해석하고, `parser.zig`는 set 크기·속성 디렉터리와 증가/정렬/범위/중복을 검사합니다. 속성 배열만 할당하며 원문 전체·문자열·dictionary·미지원 값·extra는 입력을 빌립니다. `value.zig`는 알려진 typed value, `rules.zig`는 HWP ID별 기대 타입을 소유합니다. 문자열 길이 u32 및 패딩은 DocInfo의 u16 문자열 문법과 다르며 혼용하지 않습니다. PID 0은 별도 dictionary 원문으로 보존하고 일반 태그 1로 읽지 않습니다. container/summary는 optional 정확한 루트 스트림을 소비하고 scalar 통계만 반환하므로 임시 파서/CFB를 모두 해제합니다. 다중 set·다른 FMTID·문자 변환·dictionary 이름 의미 검증은 후속 범위입니다.

요약 파서는 디렉터리 확인 후 PID1을 먼저 읽고 나서 값들을 해석합니다. 선택적인 code_page는 signed VT_I2의 16비트 원형을 보존하고, 문자열보다 뒤에 있다는 이유로 누락하지 않습니다. value는 VT_I2/LPSTR도 지원하며 LPSTR은 코드페이지 식별자와 원시 bytes를 함께 반환합니다. `strings.zig`에서 길이/단위/종결/패딩만 공유하고 문자를 변환하지 않습니다. CP1200 LPSTR도 바이트 길이이며 dictionary는 CP1200이면 UTF-16 유닛 길이와 항목별 패딩, 그 외에는 바이트 길이와 무패딩 항목입니다. dictionary의 Iterator는 raw 이름을 빌리고 실패 시 위치/잔여 개수를 유지합니다. inspect는 ID 범위/중복과 마지막 정렬 바이트를 확인하며 dictionary_structure를 반환합니다. 코드페이지 부재·문자 변환·이름 의미 검증은 아직 별도이며 dictionaries_deferred를 구조 검사 성공만으로 감소시키지 않습니다.

HWP5 기반의 책임 소유자·소유권·미지원 경계와 새 검증 기록은 [HWP5 모듈 계약 인덱스](hwp5-modules.md)의 해당 주제 문서에서 관리합니다. [기존 구현 기록](hwp5-foundation.md)은 과거 이력으로 보존합니다. 제품 JS ABI는 변경하지 않았고, 테스트 전용 bridge는 코어를 wasm32-freestanding으로 실행하기 위한 어댑터입니다.

DocInfo 리소스는 BinData·글꼴·탭·번호·글머리표·스타일·테두리/배경·글자 모양·문단 모양까지 해석합니다. `border_fill.zig`는 선 배열, `fill.zig`는 채우기 조합, `picture_info.zig`는 이미지 속성 공통 배치를 소유합니다. 문단 모양의 구/신 줄 간격을 임의로 하나로 합치지 않습니다. `resources.zig`는 주요 리소스 개수, `reference_rules.zig`는 ID 기준/부재 값, `references.zig`는 활성 참조 진단을 분리합니다. 알려진 본문 참조는 decoded 문서 진입점에 연결했으며, 외부 스트림 연결·구역 번호 fallback 및 미지원 리소스의 참조는 후속 단계입니다.

저장은 문서 모델 → HWP 레코드 → 압축된 스트림 목록 → 새 CFB 생성 순서로 구현합니다. 기존 파일의 섹터를 제자리 수정하는 기능은 초기 범위에 포함하지 않습니다.

버전별 필드 부재와 기본값을 구분하고, 미지원 레코드·스트림 및 보존에 필요한 CFB 메타데이터를 유지하는 정책을 설계해야 합니다. 단순 재저장도 정보 보존 검증 전에는 무손실이라고 주장하지 않습니다.

구현 순서: CFB 읽기 → 새 CFB 쓰기 → 전체 스트림 왕복 비교 → HWP5 최소 읽기·쓰기 → 편집 후 저장 → HWPX 공통 모델 통합. 각 단계에서 기존 Rust fixture, 독립 리더, 손상 입력 테스트로 검증합니다.

CFB 단계의 현재 경계: 읽기 기본값은 레거시 호환, strict는 명세 검증을 추가합니다. 쓰기는 항상 명세용 이름 비교와 공통 메타데이터 검사를 사용합니다. `writer_directory.zig`는 의미 모델/형제 트리, `writer_layout.zig`는 FAT/DIFAT 수와 Range Lock 예약 배치, `writer.zig`는 바이트 직렬화를 담당합니다. `name_order.zig`와 `entry_rules.zig`는 strict 읽기와 쓰기가 공유하며, JS는 이를 재구현하지 않습니다.

이전 `benchmarks/zig-spike`는 실험이며 제품 파서로 승격하지 않았습니다. 기존 실험은 `legacy/rust/benchmarks/`에서 확인할 수 있습니다.
