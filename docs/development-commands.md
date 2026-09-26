# 개발·검증 명령

[프로젝트 문서 검증 현황](verification-progress.md)은 `node tools/docs-audit-status.mjs`로 확인합니다. `--list-pending`은 경로별 상태를, `--require-complete`는 모든 추적 프로젝트 Markdown이 현재 해시로 검증됐고 누락·미추적 문서가 없는지 검사합니다. `node tools/docs-inline-links.mjs`는 일반 인라인 로컬 링크의 대상 파일만 검사합니다. `node --test tests/docs/*.test.mjs`로 두 도구의 반례를 검증합니다. 이 명령들은 문서 내용의 정확성을 자동 증명하지 않으며 최종 적대적 검증을 대신하지 않습니다.

[HWP5 각주·미주 원문 표식 위치](hwp5-note-source-sites.md)는 `zig build hwp5-audit -Doptimize=ReleaseSafe`에서 추적 `footnote-endnote.hwp`의 4건과 합성 ID·코드·누락·위치 이동 반례를 검증합니다. 로컬 `reference/rhwp/samples`가 있으면 같은 audit의 `noteControlReferenceResults`에서 추가 9·6·2건의 위치도 대조하고, 없으면 `skipped`로 구분합니다. `control_links`의 제품 코드는 재사용하며 새 파서 모드는 없습니다.

[HWP5 각주·미주 안 자동 번호 관계](hwp5-note-number-links.md)는 `zig test src/root.zig --test-filter 'HWP5 note number links'` 및 `-O ReleaseSafe`·`-O ReleaseFast`로 소유 범위와 진단 반례를 검사합니다. `node --test tests/hwp5/note-number-links.test.mjs`는 oracle 자체의 변이 반례를 검사합니다. `zig build audit -Doptimize=ReleaseSafe`의 HWP5 테스트용 WASM 문서 보고서는 `tests/hwp5/note-number-links.mjs`의 원시 Section 레코드 독립 대조를 포함합니다. 해당 실파일 검사는 로컬 HWP corpus에 한정됩니다.

[HWPX 각주·미주 원문 위치](hwpx-note-sites.md)는 `zig test src/root.zig --test-filter 'HWPX note site'`와 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 직접 `ctrl`·바깥 주석·foreign namespace·UTF-16 원본 오프셋을 검사합니다. `zig test src/hwpx_note_bodies_survey.zig -O ReleaseFast --test-filter 'HWPX note bodies real files known integration'`은 단독/known 반환값을, `python3 tools/hwpx-note-sites-diff.py`는 허용 파일별 조상 인덱스를 독립 ZIP/XML과 대조합니다. Oracle 반례는 `python3 tools/hwpx-note-sites-diff.py --self-test` 및 `python3 -O tools/hwpx-note-sites-diff.py --self-test`로 확인합니다. 실파일 검사는 로컬 `reference/rhwp`가 필요하며 기본 audit 밖입니다.

[HWPX 각주·미주 텍스트 소유](hwpx-note-text.md)는 `zig test src/root.zig --test-filter 'HWPX note text'`와 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 namespace·중첩 소유·XML 정규화·빈 요소·한도·OOM·UTF-16을 검증합니다. `zig test src/hwpx_note_text_survey.zig -O ReleaseFast --test-filter 'HWPX note text real files standalone and known integration'`은 실파일의 단독/known 결과를, `python3 tools/hwpx-note-text-diff.py`는 허용 파일별 독립 ZIP/XML 해시와 거부/암호화 분류를 대조합니다. Oracle 변이는 `python3 tools/hwpx-note-text-diff.py --self-test`와 `python3 -O tools/hwpx-note-text-diff.py --self-test`로 확인합니다. 실파일 검사는 로컬 `reference/rhwp`가 필요하며 기본 audit 밖입니다.

[전체 `zig build test`의 stderr 표기 해석](zig-test-stderr.md)은 성공 요약과 함께 나타나는 `failed command:` 러너 문구의 재현 및 판정 근거를 소유합니다. 이 문구만으로 실패라고 판단하거나 종료 코드·테스트 실패 수를 무시하지 않습니다.

[HWPX 각주·미주 본문](hwpx-note-bodies.md)은 `zig test src/root.zig --test-filter 'HWPX note bodies'`와 `-O ReleaseSafe`·`-O ReleaseFast`로 원값·직접 목록/문단·한도·OOM·소유권을 검증합니다. `zig test src/hwpx_note_bodies_survey.zig -O ReleaseFast --test-filter 'HWPX note bodies real files known integration'`은 실파일의 단독/known 경로를, `python3 tools/hwpx-note-bodies-diff.py`는 전체 허용 파일별 독립 ZIP/XML 해시와 분류를 대조합니다. `python3 tools/hwpx-note-bodies-diff.py --self-test`와 `python3 -O tools/hwpx-note-bodies-diff.py --self-test`는 oracle 변이 검출을 확인합니다. 실파일 명령에는 로컬 `reference/rhwp`가 필요하며 기본 audit 밖입니다.

[HWPX 각주·미주 안 번호 관계](hwpx-note-number-links.md)는 `zig test src/root.zig --test-filter 'HWPX note number links'`와 `-O ReleaseSafe`·`-O ReleaseFast`로 부모 관계·진단·한도·OOM을 확인합니다. `zig test src/hwpx_note_number_links_survey.zig -O ReleaseFast --test-filter 'HWPX note number links real files standalone and known integration'`은 단독/known 경로를, `python3 tools/hwpx-note-number-links-diff.py`는 허용 파일별 독립 ZIP/XML 해시를 검사합니다. Oracle 변이는 `python3 tools/hwpx-note-number-links-diff.py --self-test`와 `python3 -O tools/hwpx-note-number-links-diff.py --self-test`로 확인합니다. 실파일 검사는 로컬 `reference/rhwp`가 필요하며 기본 audit 밖입니다.

[HWPX 번호 컨트롤 원값](hwpx-number-controls.md)은 `zig test src/root.zig --test-filter 'HWPX number controls'`와 `-O ReleaseSafe`·`-O ReleaseFast`로 속성·자식 순서·한도·OOM·수명·known 연결을 검증합니다. `zig test src/hwpx_number_controls_survey.zig -O ReleaseFast --test-filter 'HWPX number controls real files known integration'`은 실파일의 단독/known 경로를, `python3 tools/hwpx-number-controls-diff.py`는 전체 후보 분류와 허용 파일별 독립 ZIP/XML 해시를 대조합니다. `python3 tools/hwpx-number-controls-diff.py --self-test`와 `python3 -O tools/hwpx-number-controls-diff.py --self-test`는 oracle 변이 검출을 확인합니다. 실파일 명령은 로컬 `reference/rhwp`가 필요하며 기본 audit 밖입니다.

[HWPX 단 설정 원값](hwpx-column-definitions.md)은 `zig test src/root.zig --test-filter 'HWPX column definitions'`와 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 원값·편차·숫자/Boolean·한도·OOM·수명을 검증합니다. `zig test src/hwpx_column_definitions_survey.zig -O ReleaseFast --test-filter 'HWPX column definitions real files known integration'`은 두 편차 실파일의 standalone/known 일치를 확인하고, `python3 tools/hwpx-column-definitions-diff.py`는 전체 후보 분류와 허용 파일별 독립 ZIP/XML 해시를 대조합니다. `python3 tools/hwpx-column-definitions-diff.py --self-test`와 `python3 -O tools/hwpx-column-definitions-diff.py --self-test`는 오라클 변이를 검사합니다. 실파일 명령에는 로컬 `reference/rhwp`가 필요하며 기본 audit 밖입니다.

[HWPX 필드 시작·끝 마커](hwpx-field-markers.md)는 `zig test src/root.zig --test-filter 'HWPX field markers'`와 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 어휘·명시적 ID 연결·한도·OOM·패키지 수명을 확인합니다. `zig test src/hwpx_field_markers_survey.zig -O ReleaseFast --test-filter 'HWPX field markers real files known integration'`은 끝이 없는 시작이 관측된 실제 3개 파일의 단독/known 결과를, `python3 tools/hwpx-field-markers-diff.py`는 두 corpus의 파일별 독립 ZIP/XML 해시를 대조합니다. `python3 tools/hwpx-field-markers-diff.py --self-test` 및 `python3 -O tools/hwpx-field-markers-diff.py --self-test`는 오라클 변이 검출을 확인합니다. 실파일 명령에는 로컬 `reference/rhwp`가 필요하며 기본 audit 밖입니다.

[HWPX indexmark·dutmal 문자열 컨트롤](hwpx-inline-string-controls.md)은 `zig test src/root.zig --test-filter 'HWPX inline string controls'` 및 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 어휘·문자 정규화·수명·한도·OOM을 확인합니다. 실제 양성 2개는 `zig test src/hwpx_inline_string_controls_survey.zig -O ReleaseFast --test-filter 'HWPX inline string controls two real files known integration'`으로 known 연결을 확인하고, 전체 484개 후보 분류와 허용 476개 파일별 결과는 `python3 tools/hwpx-inline-string-controls-diff.py`로 독립 ZIP/XML에 대조합니다. `python3 tools/hwpx-inline-string-controls-diff.py --self-test`와 `python3 -O tools/hwpx-inline-string-controls-diff.py --self-test`는 oracle 변이 검출을 확인합니다. 실파일 명령은 로컬 `reference/rhwp`가 필요하며 기본 audit에는 포함되지 않습니다.

[HWPX section metaTag 직접 텍스트](hwpx-meta-tags.md)는 `zig test src/root.zig --test-filter 'HWPX meta tags'`와 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 합성·소유권·예산·OOM을 확인합니다. 실제 양성 4건의 known 연결은 `zig test src/hwpx_meta_tags_survey.zig -O ReleaseFast --test-filter 'HWPX meta tags four real files known integration'`으로, 전체 후보 분류와 허용 파일 해시는 `python3 tools/hwpx-meta-tags-diff.py`로 독립 ZIP/XML과 대조합니다. `python3 tools/hwpx-meta-tags-diff.py --self-test` 및 `python3 -O tools/hwpx-meta-tags-diff.py --self-test`는 oracle 변이 검출을 확인합니다. 실파일 명령은 로컬 `reference/rhwp`가 필요하고 기본 audit 밖입니다.

[HWPX section 파라미터 목록](hwpx-parameter-lists.md)은 `zig test src/root.zig --test-filter 'HWPX parameter lists'` 및 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 재귀·값·한도·OOM·패키지 수명을 확인합니다. 실파일 양성은 `zig test src/hwpx_parameter_lists_survey.zig -O ReleaseFast --test-filter 'HWPX parameter lists three real files independent XML digest'`, `zig test src/hwpx_parameter_lists_survey.zig -O ReleaseFast --test-filter 'HWPX parameter lists three real files known integration'`, `zig test src/hwpx_parameter_lists_survey.zig -O ReleaseFast --test-filter 'HWPX parameter lists real fieldBegin known integration'`, `python3 tools/hwpx-parameter-lists-diff.py`로 파일별 독립 XML 해시와 known 연결을 확인합니다. 전체 484개 후보 분류와 허용 476개의 파일별 해시는 `python3 tools/hwpx-parameter-lists-diff.py --all`로 대조합니다. `python3 tools/hwpx-parameter-lists-diff.py --self-test`와 `python3 -O tools/hwpx-parameter-lists-diff.py --self-test`는 oracle 변이 검출을 확인합니다. 실파일 명령은 로컬 `reference/rhwp`가 필요하고 기본 audit 밖입니다.

[HWPX 수식 shapeComment 직접 텍스트](hwpx-equation-comments.md)는 `zig test src/root.zig --test-filter 'HWPX equation comment'` 및 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 합성·예산·OOM을 확인합니다. `zig test src/hwpx_equation_corpus.zig --test-filter 'HWPX equation comment independent XML digest fixture'`는 독립 XML 고정 해시를, `python3 tools/hwpx-equation-corpus-diff.py --self-test`와 인자 없는 실행은 변이 반례 및 실파일 파일별 대조를 확인합니다. 실파일 대조는 로컬 두 corpus가 필요하고 기본 audit 밖입니다.

[HWPX 수식 caption 목록](hwpx-equation-captions.md)은 `zig test src/root.zig --test-filter 'HWPX equation caption'`으로 필드·원문·한도·OOM을, 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 최적화 모드를 검사합니다. 공통 순회로 바뀐 표의 합성 회귀는 아래 `HWPX table shape` 필터, 실파일 회귀는 `HWPX known document inspections shard N` 8개 별도 프로세스로 검사합니다. 독립 Python XML과 고정한 수식 caption 예제 해시는 `zig test src/hwpx_equation_corpus.zig --test-filter 'HWPX equation caption independent XML digest fixture'`로 확인합니다. Python equation oracle의 `--self-test`는 caption 변이도 포함하며 실파일 파일별 해시는 현재 수식 caption 0개를 확인합니다.

[HWPX 수식 도형 자식·필드](hwpx-equation-shapes.md)도 아래 `HWPX equation` 필터에 포함됩니다. 단독으로는 `zig test src/root.zig --test-filter 'HWPX equation shape'`를 사용합니다. `-O ReleaseSafe`와 `-O ReleaseFast`를 추가해 최적화 모드별 같은 반례를 검사합니다. 공유 어휘·자식 선택의 표 회귀는 `zig test src/root.zig --test-filter 'HWPX table shape'`, 실파일 문서 연결은 아래 known survey의 8개 shard로 검사합니다. 독립 equation corpus 해시는 공통 도형 자식의 종류·위치·필드까지 포함하며, `python3 -O tools/hwpx-equation-corpus-diff.py --self-test`로 Python 최적화 모드에서도 반례 검사가 유지되는지 확인합니다.

[HWPX 본문 수식 원문·script](hwpx-equations.md)는 `zig test src/root.zig --test-filter 'HWPX equation'`으로 합성·패키지·소유권·할당 실패를 검사합니다. 로컬 두 HWPX corpus가 있으면 `python3 tools/hwpx-equation-corpus-diff.py --self-test`와 `python3 tools/hwpx-equation-corpus-diff.py`로 독립 ZIP/ElementTree 파일별 결과를 대조합니다. 마지막 명령은 ReleaseFast Zig 제품 조사를 내부에서 실행하며 기본 audit에는 포함되지 않습니다.

[HWPX 마스터페이지 텍스트 소유 스냅샷](hwpx-master-text-snapshot.md)은 `zig test src/root.zig --test-filter 'HWPX master text snapshot'`으로 합성 범위·한도·선택 분기·전 할당 실패를 확인합니다. 로컬 `reference/rhwp`가 있을 때만 `zig test src/hwpx_master_text_snapshot_survey.zig -O ReleaseFast --test-filter 'HWPX master text snapshot real file'`로 실제 한 파일의 스트리밍/소유 집계와 이벤트 내부 일관성을 검사합니다.

같은 스냅샷의 파일별 corpus 대조는 `python3 tools/hwpx-master-text-snapshot-corpus-diff.py --self-test`와 `python3 -O tools/hwpx-master-text-snapshot-corpus-diff.py --self-test`로 검증기 반례를 확인한 뒤, `python3 tools/hwpx-master-text-snapshot-corpus-diff.py`, `python3 tools/hwpx-master-text-snapshot-corpus-diff.py --selected-default`, `python3 tools/hwpx-master-text-snapshot-corpus-diff.py --selected-chart`로 각각 실행합니다. 스크립트가 ReleaseFast Zig 조사를 실행하며 두 로컬 corpus가 필요합니다. 기본 audit에는 포함되지 않습니다.

[HWPX section 텍스트 소유 스냅샷](hwpx-section-text-snapshot.md)은 `zig test src/root.zig --test-filter 'HWPX section text snapshot'`으로 합성·한도·할당 실패를, `zig test src/hwpx_section_text_snapshot_survey.zig -O ReleaseFast --test-filter 'HWPX section text snapshot known'`으로 실파일 보고서를, `python3 tools/hwpx-section-text-snapshot-diff.py`로 독립 XML 본문 바이트를 검사합니다. 실파일 두 명령은 로컬 `reference/rhwp`가 필요하고 기본 audit 밖입니다.

같은 스냅샷의 파일별 corpus 대조는 `python3 tools/hwpx-text-snapshot-corpus-diff.py --self-test`와 `python3 -O tools/hwpx-text-snapshot-corpus-diff.py --self-test`로 검증기 반례를 먼저 실행하고, `python3 tools/hwpx-text-snapshot-corpus-diff.py`로 실제 484개 후보를 독립 ZIP/XML 결과와 비교합니다. 마지막 명령이 내부에서 ReleaseFast Zig corpus 조사를 실행하며 두 로컬 corpus가 필요합니다. Git의 기본 audit에는 포함되지 않습니다.

같은 corpus의 조건부 분기 결과는 `python3 tools/hwpx-text-snapshot-corpus-diff.py --selected-default`와 `python3 tools/hwpx-text-snapshot-corpus-diff.py --selected-chart`로 각각 검증합니다. 지원 capability가 없는 기본 분기와 명시적 차트 namespace case를 분리하며, 둘 다 기본 audit 밖의 로컬 corpus 검사입니다.

[PNG RGBA 픽셀 조립](png-rgba.md)은 `zig test src/root.zig --test-filter 'PNG RGBA'`로 색 타입·저비트/16비트·투명도·Adam7·한도·OOM·위조 레이아웃을 검사합니다. 독립 실파일 대조 `python3 tools/png-rgba-corpus-diff.py`는 로컬 `reference/rhwp`, Pillow 11.3.0, BSD `olefile` 0.47이 필요합니다. 이 선택 대조는 기본 audit에 포함되지 않습니다.

[HWP5 BinData PNG RGBA](hwp5-bin-data-png-rgba.md)와 [HWPX PNG RGBA](hwpx-png-rgba.md)는 `zig test src/root.zig --test-filter 'PNG RGBA'`로 합성 컨테이너·예산·오류·OOM을 검사합니다. 실제 HWP/HWPX 제품 보고서는 `zig test src/png_rgba_product_survey.zig -O ReleaseFast --test-filter 'PNG RGBA known'`, 각 이미지의 독립 픽셀 바이트는 `python3 tools/png-rgba-product-diff.py`로 대조합니다. 선택 실파일 검사에는 로컬 `reference/rhwp`, Pillow 11.3.0, `olefile` 0.47이 필요하며 기본 audit에는 포함되지 않습니다.

[HWPX JPEG 선택 픽셀 검사](hwpx-jpeg-pixels.md)는 `zig test src/root.zig --test-filter 'HWPX manifest JPEG'`, `--test-filter 'HWP JPEG'`, `--test-filter 'HWPX known inspections opt into JPEG'`로 공유 코어·ZIP 연결·실파일 단일 사례를 검사합니다. `python3 tools/hwpx-fill-brush-image-oracle.py --self-test`와 `--jpeg-readiness`는 독립 후보·Pillow 해제 분포를 조사합니다. `python3 tools/hwpx-jpeg-pixel-diff.py`는 추적 fixture의 실제 RGB 바이트와 Zig 복호화 계수 기반 독립 IDCT 결과를 Pillow와 대조합니다(Pillow 필요, 기본 audit 밖). `zig test src/hwpx_jpeg_pixel_survey.zig -O ReleaseFast --test-filter 'HWPX JPEG pixel shard N'`의 N=0..7은 로컬 두 corpus가 필요한 선택 실파일 검사이며 기본 audit에 포함되지 않습니다.

[JPEG 관측 성분 ID 호환 정책](jpeg-component-id-compatibility.md)은 `zig test src/root.zig --test-filter 'HWPX manifest JPEG zero-based component IDs'`와 `--test-filter 'JPEG JFIF layout reports explicitly selected'`로 합성·한도·OOM을 검사합니다. 선택 실파일은 `zig test src/hwpx_jpeg_pixel_survey.zig -O ReleaseFast --test-filter 'HWPX JPEG observed zero-based'`로 세 문서·예산·거부 반례를 확인합니다. 이 검사는 로컬 `reference/rhwp`가 필요하며 기본 audit 밖입니다.

같은 선택 실파일의 실제 RGB는 `python3 tools/hwpx-jpeg-observed-pixel-diff.py --case zero-based`로 Pillow 11.3.0과 대조합니다. 로컬 `reference/rhwp`와 Pillow가 필요하며 픽셀 내용 동치가 아닌 차이 분포를 검사합니다.

[Exif 선두 Adobe 색 선언 JPEG](jpeg-exif-adobe-rgb.md)은 `zig test src/root.zig --test-filter 'HWPX manifest Exif Adobe JPEG'`로 ZIP 연결·색 선언 오류·한도·OOM·progressive를, `zig test src/hwpx_jpeg_pixel_survey.zig -O ReleaseFast --test-filter 'HWPX JPEG Exif Adobe'`로 두 corpus 34개와 실제 `(0,1,2)` 옵션 교차를 검사합니다. 실파일 픽셀 차이는 `python3 tools/hwpx-jpeg-observed-pixel-diff.py --case exif-adobe`로 확인합니다. 두 선택 검사에는 로컬 `reference/rhwp`가 필요하고 Python 검사에는 Pillow 11.3.0이 필요합니다. 기본 audit에는 포함되지 않습니다.

[Adobe 4성분 JPEG](jpeg-adobe-four-component.md)는 `zig test src/root.zig --test-filter 'JPEG Adobe complemented CMYK'`, `--test-filter 'JPEG RGB raster uses all four Adobe'`, `--test-filter 'HWPX manifest Exif Adobe four-component'`로 색 산술·4평면·HWPX 연결을 검사합니다. 위 Exif corpus 검사와 `python3 tools/hwpx-jpeg-observed-pixel-diff.py --case exif-ycck`는 실제 YCCK 2건의 해제 개수·길이 및 한 건의 Pillow 11.3.0 RGB 차이를 독립 대조합니다. 선택 실파일 검사에는 로컬 `reference/rhwp`가 필요합니다.

[Exif IFD0 방향 원값](jpeg-exif-orientation.md)은 `zig test src/root.zig --test-filter 'JPEG Exif TIFF'`와 `--test-filter 'HWPX manifest Exif TIFF orientation'`으로 양 endian·오류·한도·OOM·픽셀과 독립된 보고를 검사합니다. `python3 tools/hwpx-fill-brush-image-oracle.py --exif-orientation`은 Pillow의 독립 분포를, 위 Exif Adobe 선택 실파일 조사는 Zig의 34개 **제품 보고서** IFD0 분포와 픽셀 실패 3건의 메타데이터 보존을 비교합니다. 두 corpus와 Pillow 11.3.0이 필요한 실파일 검사는 기본 audit 밖입니다.

[HWPX BMP 픽셀 검사](hwpx-bmp-pixels.md)는 `zig test src/root.zig --test-filter 'HWPX manifest BMP'`와 그림·브러시의 기존 `HWPX picture image payloads`·`HWPX fill brush image payloads` 필터로 공유 경로를 검사합니다. 독립 Pillow 11.3.0 조사 `python3 tools/hwpx-fill-brush-image-oracle.py --bmp-pixels`와 `zig test src/hwpx_bmp_pixel_survey.zig -O ReleaseFast --test-filter 'HWPX BMP pixel shard N'`의 N=0..7은 로컬 `reference/rhwp`가 필요한 선택 실파일 검사이며 기본 audit에 포함되지 않습니다.

[HWPX OLE 관측 편차 복사본 검사](hwpx-ole-observed-repairs.md)는 `zig test src/root.zig --test-filter 'CFB observed repairs'` 및 `--test-filter 'HWPX OLE payloads'`로 strict 분리·한도·OOM을 확인합니다. 독립 `python3 tools/hwpx-ole-payload-oracle.py --self-test` 및 로컬 BSD olefile 0.47이 있는 경우 `--compat`를 실행합니다. 8개 실파일 shard는 `zig test src/hwpx_ole_repair_survey.zig -O ReleaseFast --test-filter 'HWPX OLE normalized shard N'`을 N=0..7 각각 실행합니다. 이 선택 조사는 기본 audit에 포함되지 않습니다.

[HWPX OLE 패키지 사본 검사](hwpx-ole-payloads.md)는 `zig test src/root.zig --test-filter 'HWPX OLE payloads'`와 `--test-filter 'HWPX known inspections retain packaged OLE'`로 경계·소유권·실파일 연결을 검사합니다. 독립 봉투 조사 `python3 tools/hwpx-ole-payload-oracle.py --self-test` 및 인자 없는 전체 조사 결과는 아래 HWPX known shard 0~7과 대조합니다. 실파일 shard는 로컬 `reference/rhwp`가 필요하고 기본 audit에는 포함되지 않습니다.

[OPF 이미지 후보 전수 검사](hwpx-manifest-image-payloads.md)는 `zig test src/root.zig --test-filter 'HWPX manifest image payloads'`와 `--test-filter 'HWPX known inspections include unreferenced'`로 합성·소유권·한도를 확인합니다. 독립 corpus 조사 `python3 tools/hwpx-fill-brush-image-oracle.py --self-test` 및 `--manifest-images` 결과는 아래 HWPX known shard 0~7과 대조합니다. 선택 shard는 로컬 `reference/rhwp`가 필요하고 기본 audit에는 포함되지 않습니다.


[HWPX SVG 구조](hwpx-svg-image-payloads.md)는 `zig test src/root.zig --test-filter 'SVG structure'`, `zig test src/root.zig --test-filter 'HWPX picture image payloads'`, `zig test src/root.zig --test-filter 'HWPX fill brush image payloads'`로 합성·공통 연결을, `python3 tools/hwpx-fill-brush-image-oracle.py --self-test`와 `--picture-payloads`로 독립 분류를 검사합니다. 로컬 `reference/rhwp`가 있는 경우 `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter 'HWPX known document inspections shard N'`을 N=0..7 각각 실행해 전체 corpus를 대조합니다. 실파일 8개 shard는 기본 audit에 포함되지 않습니다.

[HWP BMP 32비트 상위 바이트](hwp5-bmp-high-byte.md)는 `zig test src/root.zig --test-filter 'BMP'`로 구조·컨테이너 합성 계약을, `zig test src/hwp5_bmp_seven_known_survey.zig -O ReleaseFast --test-filter 'HWP known seven BMP'`와 `node tests/hwp5/bmp-seven-survey.mjs`로 실제 HWP 7건의 독립 DocInfo·압축·픽셀/상위 바이트 대조를 확인합니다. 실파일 두 명령은 로컬 `reference/rhwp`가 필요하며 기본 audit에 포함되지 않습니다.

[HWP5 PNG 선언·JPEG 바이트 불일치](hwp5-png-declared-jpeg.md)는 `zig test src/root.zig --test-filter 'PNG-declared JPEG'`로 합성·CFB 경로·한도·OOM을, `node tests/hwp5/png-declared-jpeg-survey.mjs`로 독립 DocInfo·JPEG 프레임 분포를 검사합니다. 실파일 전체 검사 `zig test src/hwp5_png_jpeg_mismatch_known_survey.zig -O ReleaseFast --test-filter 'HWP PNG-declared JPEG known'`과 Node 조사는 로컬 `reference/rhwp`가 필요하며 기본 audit에는 포함되지 않습니다.

[HWP5 PNG IEND 뒤 0 패딩](hwp5-png-post-iend.md)은 `zig test src/root.zig --test-filter 'PNG post-IEND'`와 `--test-filter 'HWP container PNG post-IEND'`, HWPX 기본 strict의 `--test-filter 'HWPX picture image payloads keep post-IEND'`, 독립 `node --test tests/hwp5/png-post-iend-evidence.test.mjs`로 검증합니다. 선택 실파일은 `zig test src/hwp5_png_post_iend_known_survey.zig -O ReleaseFast --test-filter 'HWP PNG known zero tail'`, 선언 PNG 전수 조사는 `node tests/hwp5/png-post-iend-survey.mjs`로 재현합니다. 마지막 두 명령은 로컬 `reference/rhwp`가 필요하며 기본 audit에는 포함되지 않습니다.

[HWP5 BinData WMF](hwp5-bin-data-wmf.md)는 `zig test src/root.zig --test-filter 'HWP WMF'`, `--test-filter 'HWP container WMF'`로 선택·컨테이너 연결을, `node --test tests/hwp5/wmf-framing-evidence.test.mjs`로 독립 framing 반례를 확인합니다. 실파일은 `zig test src/hwp5_wmf_known_survey.zig -O ReleaseFast --test-filter 'HWP WMF known'`, 독립 DocInfo·압축·WMF framing 대조는 `node tests/hwp5/wmf-corpus.mjs`, 선언 WMF 전수 분류는 `node tests/hwp5/wmf-corpus-survey.mjs`입니다. 세 실파일 명령은 로컬 `reference/rhwp`가 필요하고 기본 audit에 포함되지 않습니다.

[HWP5 BinData PCX](hwp5-bin-data-pcx.md)는 `zig test src/root.zig --test-filter 'HWP PCX'`, `--test-filter 'HWP container PCX'`로 단위·컨테이너 연결을 검사합니다. 선택 실파일은 `zig test src/hwp5_pcx_known_survey.zig -O ReleaseFast --test-filter 'HWP PCX known'`, 독립 해시·압축 정책 조사는 `node tests/hwp5/pcx-corpus.mjs`로 재현합니다. 두 실파일 명령에는 로컬 `reference/rhwp`가 필요하며 기본 audit에는 포함하지 않습니다.

[PCX 헤더·RLE 경계](pcx-structure.md)는 `zig test src/root.zig --test-filter 'PCX structure'`로 단위·반례를 검사하고, `--test-filter 'HWPX picture image payloads'`로 ZIP·MIME·오류 연결을 확인합니다. 독립 `python3 tools/hwpx-fill-brush-image-oracle.py --self-test`와 `--picture-payloads` 및 아래 known survey ReleaseFast shard 7이 실파일 PCX 1건의 RLE 경계를 대조합니다.

[HWPX 그림 이미지 바이트 검사](hwpx-picture-image-payloads.md)는 `zig test src/root.zig --test-filter 'HWPX picture image payloads'`로 형식·WMF framing·TIFF 연결·중복·한도·오류·OOM·추적 파일·master 조립을 검사합니다. [TIFF 구조](tiff-structure.md)는 `zig test src/root.zig --test-filter 'TIFF structure'`로 별도 검사합니다. 기존 브러시의 동일 코어 회귀는 `--test-filter 'HWPX fill brush image payloads'`로 확인합니다. `python3 tools/hwpx-fill-brush-image-oracle.py --self-test`와 `--picture-payloads`는 독립 반례·실파일 형식/바이트 분포, WMF framing과 TIFF 구조 진단을 제공하며, 아래 known survey의 ReleaseFast 8개 shard가 제품 결과와 대조합니다.

[HWPX 그림 이미지 OPF 연결](hwpx-picture-image-links.md)은 `zig test src/root.zig --test-filter 'HWPX picture image links'`로 다섯 상태·직접 부모/namespace·한도·OOM·추적 실파일을 검사합니다. `python3 tools/hwpx-fill-brush-image-oracle.py --self-test`와 `--pictures`가 직접 `pic/img`의 독립 대조값을 생성합니다. 아래 `HWPX known document inspections shard N`을 N=0..7 각각 ReleaseFast 프로세스로 실행해 1993개 section/35개 마스터페이지 사이트와 OPF 항목 인덱스 합계를 확인합니다.

[HWPX fillBrush 이미지 바이트 검사](hwpx-fill-brush-image-payloads.md)는 `zig test src/root.zig --test-filter 'HWPX fill brush image payloads'`로 형식·MIME 편차·중복·한도·내부 체크섬·OOM·추적 실파일을 검사합니다. `python3 tools/hwpx-fill-brush-image-oracle.py --self-test`와 `--payloads`가 선택 실파일의 형식·고유 대상·바이트·MIME 불일치를 독립 조사합니다. 아래 known survey의 8개 ReleaseFast shard를 N=0..7 각각 실행해 대조합니다.

[HWPX fillBrush 이미지 OPF 연결](hwpx-fill-brush-image-links.md)은 `zig test src/root.zig --test-filter 'HWPX fill brush image links'`로 다섯 상태·출처·예산·OOM을, `--test-filter 'HWPX master fill brushes connect known'`으로 마스터페이지와 스트리밍 범위 차이를 검사합니다. `python3 tools/hwpx-fill-brush-image-oracle.py --self-test` 및 인자 없는 실행이 독립 반례와 8개 shard의 manifest 대상 인덱스 합계를 제공합니다. 아래 `HWPX known document inspections shard N`을 N=0..7 각각 별도 ReleaseFast 프로세스로 실행해 실파일 390건을 대조합니다.

[HWPX 공통 fillBrush](hwpx-fill-brush.md)는 `zig test src/root.zig --test-filter 'HWPX fill brushes'`로 합성·한도·OOM, `--test-filter 'HWPX known inspections compose'`와 실제 presentation 통합 테스트로 문서 API를 검사합니다. `zig test src/hwpx/xml_values.zig`는 공통 float 어휘를, `python3 tools/hwpx-fill-brush-oracle.py --self-test` 및 인자 없는 실행은 독립 반례·8개 shard 기대값을 확인합니다. 아래 `HWPX known document inspections shard N`을 N=0..7 각각 별도 ReleaseFast 프로세스로 실행합니다.

[HWPX 마스터페이지 fillBrush](hwpx-master-fill-brush.md)는 `zig test src/root.zig --test-filter 'HWPX master fill brushes'`로 파트·원값·한도·OOM 및 문서 API를 검사합니다. `python3 tools/hwpx-fill-brush-oracle.py --self-test`와 `--master`는 별도 manifest 선택 반례 및 독립 마스터페이지 census를 확인합니다. 아래 known survey 8개 ReleaseFast shard가 파트·브러시 수와 색상 원값 합계를 대조합니다.

[HWPX 구역 프레젠테이션 원값](hwpx-section-presentation.md)은 `zig test src/root.zig --test-filter 'HWPX section presentation'`으로 합성·실파일·한도·OOM을 검사합니다. `python3 tools/hwpx-section-presentation-oracle.py --self-test`와 인자 없는 실행은 독립 반례·8개 shard 기대값을 생성합니다. 아래 `HWPX known document inspections shard N`을 N=0..7 각각 별도 ReleaseFast 프로세스로 실행해 속성·직접 브러시 분포를 대조합니다.

[HWPX 구역 각주·미주 모양](hwpx-section-note-shapes.md)은 `zig test src/root.zig --test-filter 'HWPX section note shapes'`로 합성·한도·OOM 및 편차 실파일을 검사합니다. `python3 tools/hwpx-section-note-shapes-oracle.py --self-test`와 인자 없는 실행이 독립 반례·8개 shard 기대값을 생성합니다. 아래 `HWPX known document inspections shard N`을 N=0..7 각각 별도 ReleaseFast 프로세스로 실행해 원값 분포를 대조합니다.

[HWPX 구역 쪽 테두리 ID 참조](hwpx-section-page-border-references.md)는 `zig test src/root.zig --test-filter 'HWPX page border references'`로 ID 0/표 부재/미해결 및 실파일을 확인합니다. `python3 tools/hwpx-section-page-border-oracle.py --self-test`와 `python3 -O tools/hwpx-section-page-border-oracle.py --self-test`로 header ID 집합·section 참조 조사기의 일반·최적화 반례를 확인하고, 인자 없는 실행으로 실파일을 대조합니다. 아래 known survey 8개 ReleaseFast shard가 문서별 해결 분할과 첫 미해결 위치를 검증합니다.

[HWPX 구역 쪽 테두리·배경](hwpx-section-page-borders.md)은 `zig test src/root.zig --test-filter 'HWPX section page borders'`로 합성·한도·할당 실패를, `--test-filter 'HWPX known inspections compose'`로 실파일 조립을 확인합니다. 위 조사기의 일반·최적화 자체 반례와 인자 없는 실행은 독립 반례·8개 shard 기대값을 제공합니다. 아래 `HWPX known document inspections shard N`을 N=0..7 각각 별도 ReleaseFast 프로세스로 실행해 대조합니다.

[HWPX 구역 직접 설정](hwpx-section-direct-settings.md)은 `zig test src/root.zig --test-filter 'HWPX section direct settings'`로 합성·한도·할당 실패를, `--test-filter 'HWPX known inspections preserve observed grid'`로 확장 속성 실파일을 검사합니다. `python3 tools/hwpx-section-direct-settings-oracle.py --self-test`와 `python3 -O tools/hwpx-section-direct-settings-oracle.py --self-test`로 독립 조사기의 일반·최적화 반례를 확인하고, 인자 없는 실행으로 8개 shard 기대값을 생성합니다. 아래 `HWPX known document inspections shard N`을 N=0..7 각각 별도 ReleaseFast 프로세스로 실행해 대조합니다.

[HWPX 구역 번호·메모 모양 ID 참조](hwpx-section-definition-references.md)는 `zig test src/root.zig --test-filter 'HWPX section definition references'`, `--test-filter 'HWPX header resources index memo'`, `--test-filter 'HWPX known inspections resolve real memo'`로 합성 분기·header 색인·실파일 연결을 검사합니다. `python3 tools/hwpx-section-definition-reference-oracle.py --self-test`와 `python3 -O tools/hwpx-section-definition-reference-oracle.py --self-test`로 독립 조사기의 일반·최적화 반례를 확인하고, 인자 없는 실행으로 8개 shard 기대값을 생성합니다. 실제 Zig 대조는 아래 `HWPX known document inspections shard N`을 N=0..7 각각 별도 프로세스로 실행합니다.

[HWPX 구역 정의](hwpx-section-definitions.md)는 `zig test src/root.zig --test-filter 'HWPX section definition'`으로 필드·자식·한도·OOM을, `--test-filter 'HWPX known inspections preserve tracked section definition fields'`로 추적 HWPX의 전 필드를 검사합니다. `python3 tools/hwpx-section-definition-oracle.py --self-test`와 `python3 -O tools/hwpx-section-definition-oracle.py --self-test`로 독립 조사기의 일반·최적화 반례를 확인하고, 인자 없는 실행으로 두 corpus 기대값을 생성합니다. 실제 파일 Zig 대조는 아래 `HWPX known document inspections shard N`을 N=0..7 각각 별도 프로세스로 실행합니다.

[HWPX 구역 쪽 설정](hwpx-page-geometry.md)은 `zig test src/root.zig --test-filter 'HWPX page geometry'`로 합성·숫자 경계·할당 실패를, `--test-filter 'HWPX known inspections expose page geometry'`와 기존 known-inspections 합성 테스트로 문서 API 연결 및 추적 HWPX 3개의 독립 XML 조사값을 대조합니다. `python3 tools/hwpx-page-geometry-oracle.py --self-test`와 `python3 -O tools/hwpx-page-geometry-oracle.py --self-test`로 독립 조사기의 일반·최적화 반례를 확인하고, 인자 없는 실행으로 로컬 두 corpus의 XML 원값·8개 shard 기대값을 산출합니다. Zig 실파일 대조는 아래 `HWPX known document inspections shard N`을 N=0..7 각각 실행합니다.

[HWPX 문단 직접 자식 구조](hwpx-paragraph-children.md)는 `zig test src/root.zig --test-filter 'HWPX paragraph children'`로 합성·한도 검사를, `python3 tools/hwpx-section-text-oracle.py`와 선택 실파일 known survey 8개 shard로 독립 집계를 대조합니다. 실파일 표본은 로컬 `reference/rhwp`가 필요합니다.

[HWPX 문단 줄 조각](hwpx-line-segments.md)은 `zig test src/root.zig --test-filter 'HWPX line segments'`로 합성·숫자 경계·할당 실패를, 같은 독립 조사기와 선택 실파일 known survey 8개 shard로 원값 합계·부재·음수·상위 비트 편차를 대조합니다.

[HWPX 마스터페이지 문단 줄 조각](hwpx-master-line-segments.md)은 `zig test src/root.zig --test-filter 'HWPX master line segments'`로 합성·예산·할당 실패를, `python3 tools/hwpx-manifest-xml-oracle.py --self-test`와 인자 없는 corpus 조사 및 선택 실파일 known survey 8개 shard로 독립 원값 합계를 대조합니다.

[HWPX 마스터페이지 문단 직접 자식](hwpx-master-paragraph-children.md)은 `zig test src/root.zig --test-filter 'HWPX master paragraph children'`로 합성·전역 예산·할당 실패를, `python3 tools/hwpx-manifest-xml-oracle.py --self-test`와 인자 없는 corpus 조사 및 선택 실파일 known survey 8개 shard로 독립 자식 분포를 대조합니다.

[HWPX 마스터페이지 텍스트 이벤트](hwpx-master-text.md)는 `zig test src/root.zig --test-filter 'HWPX master text'`와 기존 `HWPX section text` 필터로 합성·공통 스캐너 회귀를 확인합니다. `python3 tools/hwpx-manifest-xml-oracle.py --self-test` 및 인자 없는 corpus 조사와 `HWPX known document inspections shard N` 8개 선택 검사는 텍스트 개수·UTF-8 바이트·문서별 순서 지문 합계를 대조합니다. 선택 shard는 로컬 `reference/rhwp`가 필요하고 기본 audit에는 포함되지 않습니다.

[HWPX 마스터페이지 이진 리소스 참조](hwpx-master-binary-references.md)는 `zig test src/root.zig --test-filter 'HWPX master binary'`로 합성·한도·할당 실패를 확인합니다. 독립 `python3 tools/hwpx-manifest-xml-oracle.py --self-test` 및 인자 없는 corpus 조사와 `HWPX known document inspections shard N` 8개 선택 검사는 출처별 대상 분포를 대조합니다. 선택 shard는 로컬 `reference/rhwp`가 필요합니다.

[HWPX 마스터페이지 차트 경로·XML 검사](hwpx-master-chart-references.md)는 `zig test src/root.zig --test-filter 'HWPX master chart links'`로 합성·원문/선택·오류·할당 실패를 검사합니다. 기존 `HWPX chart links` 필터도 재실행합니다. 독립 `python3 tools/hwpx-manifest-xml-oracle.py --self-test`와 인자 없는 corpus 조사에서 `master_chart_elements`·`master_chart_attributes`를 확인하고, 선택 실파일 known survey 8개 shard를 각각 실행해 0건 및 파트 범위를 대조합니다. 이 corpus는 양성 마스터페이지 차트를 포함하지 않습니다.

[HWPX 마스터페이지 표 격자](hwpx-master-table-geometry.md)는 `zig test src/root.zig --test-filter 'HWPX master table geometry'`로 범위·병합·예산·할당 실패를 검사합니다. `python3 tools/hwpx-table-oracle.py --self-test`와 인자 없는 corpus 조사에서 `master_shards`를 만들고, `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter 'HWPX known document inspections shard N'`을 N=0..7 각각 실행해 대조합니다. 실파일 조사는 로컬 `reference/rhwp`가 필요합니다.

[HWPX 선택 분기 표 격자](hwpx-selected-table-geometry.md)는 `zig test src/root.zig --test-filter 'HWPX selected table geometry'`로 양쪽 원문/활성 선택·중첩·한도·할당 실패를 확인합니다. 기존 선택 참조·텍스트·서식 회귀 필터도 다시 실행합니다. `python3 tools/hwpx-table-oracle.py --self-test`와 인자 없는 corpus 조사의 `section_switch_tables`·`master_switch_tables`를 확인하고, `HWPX known document inspections shard N`을 N=0..7 각각 실행해 실파일 switch 문서의 원문/선택 표 동치를 확인합니다. 실파일에는 양성 조건부 표가 없습니다.

[HWPX 조건부 참조 선택](hwpx-switch-selection.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX selected references'`로, 실제 corpus 대조는 `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter 'HWPX known document inspections shard N'`을 N=0..7 각각 별도 프로세스로 실행합니다. 후자는 로컬 `reference/rhwp`가 필요합니다.

[HWPX 표 격자 구조](hwpx-table-geometry.md)는 `zig test src/root.zig --test-filter 'HWPX table geometry'`로 합성·할당 실패를, 위 known survey 8개 shard로 실파일 표·행·셀 개수와 진단을 검사합니다. 독립 조사기 반례는 `python3 tools/hwpx-table-oracle.py --self-test`, 실파일 집계는 인자 없이 실행합니다. 실파일 조사는 기본 audit에 포함되지 않습니다.

[표 셀 크기·여백·속성·테두리 참조](hwpx-table-cell-fields.md)는 `zig test src/root.zig --test-filter 'HWPX table cell fields'`, `--test-filter 'HWPX table cell attributes'`, `--test-filter 'HWPX table cell border references'`와 `--test-filter 'HWPX known inspections distinguish missing border target'`로 합성·오류·참조 분기·할당 실패를 확인합니다. `zig test src/hwpx/xml_values.zig`는 공통 숫자 어휘를 검사합니다. 같은 known survey 8개 shard로 독립 Python 조사기의 크기·여백·속성 분포와 테두리 ID 해결을 대조합니다. 기본 audit에는 실파일 분할이 포함되지 않습니다.

[표 셀 직접 subList](hwpx-table-cell-sublists.md)는 `zig test src/root.zig --test-filter 'HWPX cell subLists'`로 합성·오류·한도·할당 실패를, 위의 `HWPX known inspections include table geometry`로 전체 문서 연결을 확인합니다. 같은 known survey 8개 shard에서 독립 Python 조사기의 목록·직접 문단·속성 분포를 대조합니다.

[표 자체 속성](hwpx-table-attributes.md)은 `zig test src/root.zig --test-filter 'HWPX table attributes'`로 합성·오류·할당 실패를 확인합니다. 독립 `python3 tools/hwpx-table-oracle.py --self-test` 및 인자 없는 corpus 집계와 위 known survey 8개 shard를 대조합니다. 특히 표 `borderFillIDRef=0`의 미해결 5건을 셀 참조 결과와 혼동하지 않습니다.

[표 직접 여백·셀 구역](hwpx-table-children.md)은 `zig test src/root.zig --test-filter 'HWPX table children'`로 합성·오류·예산·할당 실패를 검사합니다. 위 독립 표 조사기와 선택 실파일 known survey 8개 shard에서 여백·구역 수와 좌표·테두리 ID 합계를 대조합니다.

[표 상속 shape 필드·자식](hwpx-table-shape.md)은 `zig test src/root.zig --test-filter 'HWPX table shape'`로 합성·오류·예산·할당 실패를, `python3 tools/hwpx-table-oracle.py --self-test`로 독립 반례를 검사합니다. 선택 실파일 known survey 8개 shard에서 `sz`·`pos`·`outMargin`·`caption`·`label` 분포와 원값 합계, 모델 밖 `textWrap=THROUGH`를 대조합니다.

[표 행·셀 직접 자식 topology](hwpx-table-child-topology.md)는 `zig test src/root.zig --test-filter 'HWPX table child topology'`로 합성·한도·할당 실패를, 같은 독립 표 조사기와 선택 실파일 8개 shard로 미등록 자식·속성 및 알려진 직접 자식의 정확한 두 관측 순서와 나머지 순서 분포를 대조합니다.

[선택 분기 section 텍스트](hwpx-selected-section-text.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX selected section text'`로 실행합니다. 조건부 분기가 있는 실파일의 텍스트 보존 대조는 같은 known survey 8개 shard에 포함됩니다.

[선택 분기 서식 참조](hwpx-selected-style-references.md)는 `zig test src/root.zig --test-filter 'HWPX selected style references'`로 합성·할당 실패를 검사합니다. 실파일의 선택 텍스트·서식 참조 교차 대조는 위 known survey 8개 shard를 별도 프로세스로 실행합니다.

[선택 분기 마스터페이지 서식 참조](hwpx-selected-master-style-references.md)는 `zig test src/root.zig --test-filter 'HWPX selected master style references'`로 합성·한도·할당 실패를 검사합니다. `HWPX master style references`와 `HWPX selected style references` 필터도 회귀 실행하고, 선택적 known survey 8개 shard를 각각 실행해 마스터페이지 선택 텍스트와 문단·run 수를 대조합니다. 실파일 조사는 로컬 `reference/rhwp`가 필요합니다.

```sh
zig fmt --check build.zig src
zig build test
zig build -Doptimize=ReleaseSafe
zig build compare -Doptimize=ReleaseSafe
zig build audit -Doptimize=ReleaseSafe
```

파서·writer 변경에는 정상 입력뿐 아니라 잘림·잘못된 참조·크기 경계 테스트를 추가합니다. WASM ABI 변경은 실제 WebAssembly 인스턴스에서 확인합니다. 문서만 변경한 경우 관련 링크·경로·내용 검증으로 충분합니다.

HWPX 전용 테스트는 `zig test src/root.zig --test-filter HWPX`로 실행합니다. ZIP 엔트리·손상 경계·할당 실패와 두 corpus의 패키지 관계·버전 XML·[암호화 분류](hwpx-protection.md), 대표 표본의 [header·spine 구조](hwpx-document-structure.md)와 [header 리소스 ID 색인](hwpx-header-resources.md), [section p/run 서식 참조](hwpx-section-references.md), [header 내부 서식 참조](hwpx-header-references.md), [언어별 글꼴 ID](hwpx-font-references.md), [번호·글머리표 내부 참조](hwpx-list-references.md), [이진 리소스 manifest 연결](hwpx-binary-references.md), [차트 경로·XML 경계](hwpx-chart-references.md)를 검사합니다. 기존 패키지 테스트 일부가 Git에 추적되지 않는 로컬 `reference/rhwp` 예제를 사용하므로 이 명령과 `zig build test`도 깨끗한 체크아웃에서 그대로 재현되지는 않습니다. 나머지 내부 참조나 공개 JS API 검사는 아닙니다. ZIP 범위는 [HWPX ZIP 컨테이너](hwpx-zip-container.md), 패키지 관계 범위·실측은 [HWPX 패키지 관계 검증](hwpx-package-relationships.md), 버전 필드 변형은 [HWPX 버전 XML 검증](hwpx-version.md)을 참조합니다.

[차트 데이터 캐시 구조](hwpx-chart-cache.md) 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX chart cache'`로 선택할 수 있습니다. 차트 경로 검사와 결합된 캐시 진단 및 두 차트 간 한도 테스트는 `--test-filter 'HWPX chart'`로 함께 확인합니다.

[차트 수식 참조 구조](hwpx-chart-formula.md) 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX chart formula'`로 선택합니다. 경로와의 통합 테스트는 `--test-filter 'HWPX chart'`에 포함됩니다.

다단계 차트 범위는 `zig test src/root.zig --test-filter 'HWPX chart caches'`, `--test-filter 'HWPX chart formulas'`, `--test-filter 'HWPX chart links'`로 각각 검사하고, `python3 tools/hwpx-chart-text-oracle.py --self-test` 및 인자 없는 전체 차트 조사의 `multilevel_*` 집계와 대조합니다. 양성 실파일은 현재 로컬 corpus에 없습니다.

[차트 값·수식 텍스트 관측](hwpx-chart-text.md)의 공통 XML 이벤트 테스트는 `zig test src/root.zig --test-filter 'XML content visitor'`, 차트의 텍스트 한도·집계는 `zig test src/root.zig --test-filter 'HWPX chart'`로 확인합니다. 선택 실파일 제품 조사와 독립 대조는 각각 아래 `hwpx_structure_survey.zig`의 차트 필터와 `python3 tools/hwpx-chart-text-oracle.py`를 실행합니다. Python oracle은 제품·기본 audit 의존성이 아닙니다.

[차트 ST_Xstring](hwpx-xstring.md)의 해독기 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX Xstring'`, 차트 통합 테스트는 위 `HWPX chart` 필터로 실행합니다. corpus에는 해당 이스케이프가 없으므로 독립 oracle의 원문 값 길이 대조를 해독 정확성의 증거로 사용하지 않습니다.

[HWPX section 텍스트·내부 요소 이벤트](hwpx-section-text.md)는 `zig test src/root.zig --test-filter 'HWPX section text'`로 합성·오류 경계를 검사합니다. 선택 실파일 제품 조사는 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX corpus section text and inline token read-only survey'`, 직접 run이 없는 실파일 회귀 검사는 같은 명령의 필터를 `HWPX layout-only paragraph keeps its real section diagnostic`으로 바꿔 실행합니다. 독립 대조는 `python3 tools/hwpx-section-text-oracle.py`로 실행합니다. 이 선택 검사들은 Git에 없는 로컬 `reference/rhwp`가 필요하며 기본 audit에 포함되지 않습니다.

[HWPX section 원문·요소 인덱스](hwpx-section-tree.md)의 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX section tree'`로 실행합니다. 선택 실파일 조사는 `HWPX corpus section tree shard 0`부터 `shard 7`까지의 이름을 각각 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter '<이름>'`에 넣어 **별도 프로세스**로 실행합니다. 한 프로세스에서 전 shard를 실행하면 메모리 압박으로 종료될 수 있습니다. 이 조사는 위와 같은 로컬 corpus가 필요하며 기본 audit에는 포함되지 않습니다. 독립 요소 수와 shard별 기대값은 `python3 tools/hwpx-section-text-oracle.py`의 `section_elements`·`section_tree_shards`와 대조합니다. 선택한 문단·run 속성 6개의 정규화 값과 부재는 `section_tree_shards[].attribute_digest_sum`, 출현·빈 값 수는 `section_attribute_counts`로 독립 대조합니다.

[HWPX header 원문·요소 인덱스](hwpx-header-tree.md)의 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX header tree'`로 실행합니다. 선택 실파일 조사는 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX corpus header tree read-only survey'`로 별도 실행하고, `python3 tools/hwpx-section-text-oracle.py`의 `header_elements`·`header_ordered_digest_sum`을 독립 대조합니다. Git에 없는 로컬 `reference/rhwp`가 필요하며 기본 audit에는 포함되지 않습니다.

[HWPX 문서 XML 트리 조립](hwpx-document-trees.md)의 합성·할당 실패 검사는 `zig test src/root.zig --test-filter 'HWPX XML trees'`로 실행합니다. 선택 실파일은 `HWPX owned XML document trees shard 0`부터 `shard 7`까지를 각각 `zig test src/hwpx_document_trees_survey.zig -O ReleaseFast --test-filter '<이름>'`에 넣어 **별도 프로세스**로 실행합니다. `python3 tools/hwpx-section-text-oracle.py`의 `section_tree_shards[]`에 있는 `accepted`·`sections`·`header_elements`·`elements`·`header_bytes`·`section_bytes`와 독립 대조합니다. 이 조사는 로컬 `reference/rhwp`가 필요하며 기본 audit에는 포함되지 않습니다.

[HWPX 문단 메타 속성](hwpx-paragraph-metadata.md)의 단위 검사는 `zig test src/root.zig --test-filter 'HWPX paragraph metadata'`로 실행합니다. 위의 같은 8개 선택 shard가 `section_tree_shards[].paragraph_metadata`의 문단·ID·Boolean 집계도 독립 대조합니다. 기본 audit에는 이 실파일 대조가 포함되지 않습니다.

[HWPX header 시작 번호](hwpx-header-begin-numbers.md)의 단위 검사는 `zig test src/root.zig --test-filter 'HWPX begin numbers'`로 실행합니다. 위의 8개 선택 shard가 `section_tree_shards[].begin_numbers`의 요소·속성 존재 및 값 합계와 독립 대조합니다. 이 실파일 대조도 기본 audit에는 포함되지 않습니다.

[HWPX 현재 지원 검사 묶음](hwpx-known-inspections.md)의 합성·실예제·할당 실패 테스트는 `zig test src/root.zig --test-filter 'HWPX known'`로 실행합니다. 선택 실파일은 `HWPX known document inspections shard 0`부터 `shard 7`까지를 각각 `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter '<이름>'`에 넣어 별도 프로세스로 실행합니다. 로컬 `reference/rhwp` corpus가 필요하고 기본 audit에는 포함되지 않습니다. 이 검사는 반복 파싱으로 비용이 높으며 전체 문서 유효성 판정이 아닙니다.

[HWPX 모든 ZIP 엔트리 무결성](hwpx-payload-integrity.md)의 합성 손상·한도·소유권 테스트는 `zig test src/root.zig --test-filter 'HWPX payload integrity'`로 실행합니다. 이 검사는 `inspectKnown`에도 포함되므로 위 8개 선택 shard는 미선택 BinData·부가 ZIP 엔트리의 해제·CRC도 거칩니다. 바이너리 내부 포맷·XML 스키마까지 검증하는 것은 아닙니다.

[HWPX OPF 선언 XML 전수 문법 검사](hwpx-manifest-xml.md)는 `zig test src/root.zig --test-filter 'HWPX manifest XML'`로 단위 검사를 실행합니다. `inspectKnown`의 위 8개 선택 shard가 전체 내장 `application/xml` 엔트리의 수·바이트·요소 및 settings/masterpage 수를 `python3 tools/hwpx-manifest-xml-oracle.py`의 독립 ZIP/ElementTree 결과와 대조합니다. 외부/비XML 항목이나 XML 의미 검증으로 확대하지 않습니다.

[HWPX settings 원값 검사](hwpx-settings.md)는 `zig test src/root.zig --test-filter 'HWPX settings'`와 `zig test src/root.zig --test-filter 'HWPX known'`로 합성 ZIP·묶음 경로를 확인합니다. 위 `HWPX known document inspections shard 0`부터 `shard 7`까지의 선택 실파일 검사는 `python3 tools/hwpx-manifest-xml-oracle.py`의 settings 존재·Caret/config 개수·값 합계와 대조합니다. 전체 설정 의미 검증은 아닙니다.

[HWPX masterpage 파트·참조](hwpx-master-pages.md)는 `zig test src/root.zig --test-filter 'HWPX master'`로 합성 ZIP·오류·한도·할당 실패를 확인합니다. 위의 8개 `HWPX known document inspections shard N` 선택 검사에서 `python3 tools/hwpx-manifest-xml-oracle.py`의 루트 타입·subList 개수·pageNumber 합계·section 참조·선언 수를 대조합니다. `masterPageCnt`와 실제 참조 개수의 동치는 주장하지 않습니다.

[HWPX ParaListType 직접 속성](hwpx-para-list.md)도 같은 `HWPX master` 합성 검사를 사용합니다. 독립 Python 조사의 subList 직접 문단 수·속성 존재·폭/높이 합계는 위 8개 실파일 shard와 대조합니다. 기본 audit에 실파일 조사가 포함되지는 않습니다.

[마스터페이지 문단 메타 값](hwpx-paragraph-metadata.md)도 `HWPX master` 합성 검사와 위 8개 shard에서 확인합니다. 독립 Python 조사의 `master_paragraphs`·ID 부재/0·`paraTcId` 부재·Boolean true 집계와 대조하며, section 기존 경로는 `zig test src/root.zig --test-filter 'HWPX paragraph metadata'`로 확인합니다.

[마스터페이지 서식 참조](hwpx-master-style-references.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX master style'`, 기존 section 규칙의 회귀는 `zig test src/root.zig --test-filter 'HWPX section references'`로 확인합니다. 위 `HWPX known document inspections shard N` 8개 선택 검사는 독립 `python3 tools/hwpx-manifest-xml-oracle.py`의 `master_style_*` 집계와 대조하며 기본 audit에는 포함되지 않습니다.

[run 변경 추적 ID 원값](hwpx-run-metadata.md)의 합성 section·마스터페이지 검사는 `zig test src/root.zig --test-filter 'HWPX run metadata'`로 실행합니다. 위의 8개 선택 shard는 독립 `python3 tools/hwpx-manifest-xml-oracle.py`의 `section_run_metadata`·`master_run_metadata`와 대조합니다. 실파일에서는 두 속성이 전부 부재하므로 명시적 값 분기는 합성 테스트만 검증합니다.

[run 위치·자식 진단](hwpx-run-topology.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX run topology'`로 실행합니다. 같은 8개 선택 shard에서 독립 Python oracle의 `*_run_non_direct`, `*_run_secpr_*`, `*_run_child_classes`와 대조하며, 공개 모델 미등록 요소를 오류로 강제하지 않습니다.

[`hp:t` 원값·자식 진단](hwpx-text-nodes.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX text node'`로 실행합니다. 같은 8개 선택 shard에서 독립 Python oracle의 `*_text_nodes`·`*_text_child_classes`와 대조합니다. 선택 검사에는 로컬 corpus가 필요하고 기본 audit에는 포함되지 않습니다.

[조건부 switch 구조](hwpx-switch-shape.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX switch shape'`로 실행합니다. 선택 실파일 8개 shard에서 독립 oracle의 `section_switch_shape`·`master_switch_shape` 21개 슬롯과 대조합니다. 기본 audit에는 실파일 shard가 포함되지 않습니다.

[`hp:tab` 속성 진단](hwpx-inline-tab.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX tab attributes'`로 실행합니다. 같은 8개 선택 shard에서 독립 oracle의 `section_tab_fields`·`master_tab_fields` 21개 슬롯과 대조합니다. 기본 audit에는 실파일 shard가 포함되지 않습니다.

[인라인 주석 마커 속성](hwpx-inline-annotations.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX inline annotation'`으로 실행합니다. 같은 8개 선택 shard에서 독립 oracle의 `section_markpen_fields`·`master_markpen_fields` 9개 슬롯과 `section_title_mark_fields`·`master_title_mark_fields` 6개 슬롯을 대조합니다.

[인라인 변경 추적 태그](hwpx-track-change-tags.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX track change tag'`로 실행합니다. 같은 8개 선택 shard에서 독립 oracle의 `section_track_change_tag_fields`·`master_track_change_tag_fields` 20개 슬롯을 대조합니다. 현재 corpus에는 네 태그가 없어 실파일 속성값은 검증되지 않았습니다.

[HWPX section 직접 문자 콘텐츠](hwpx-section-content.md)의 단위 테스트도 위의 `HWPX section tree` 필터에 포함됩니다. 같은 8개 선택 shard에서 `section_tree_shards[].content_digest_sum`을 독립 Python Expat의 직접 콘텐츠 합계와 대조합니다. 이 합계는 요소별 정규화 문자 값의 검증이며 개별 콜백 경계의 동치 주장은 아닙니다.

요소와 문자를 섞어 전달하는 `visitOrdered`도 같은 테스트·shard 명령으로 검사합니다. 독립 Expat의 경계별 문자·시작/끝 순서 해시는 `section_tree_shards[].ordered_digest_sum`으로 대조하며, 빈 태그는 시작+끝으로 정규화합니다. 순서 해시의 반례 테스트는 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX ordered digest detects moved text'`로 실행합니다. 주석·처리 지시문과 콜백 분할은 포함하지 않습니다.

[HWPX XML 네임스페이스 버전 경계](hwpx-namespace-profiles.md)는 `zig test src/root.zig --test-filter 'HWPX namespace profile'`로 합성 루트·패키지 오류를 검사합니다. 로컬 corpus의 header·spine 루트 분포는 `python3 tools/hwpx-section-text-oracle.py`의 `header_root_names`·`spine_xml_root_names`로 확인합니다. 해당 corpus에 후속 OWPML 루트가 없으므로 이 검사는 후속 버전 실파일 호환성 검사가 아닙니다.

전체 corpus의 header/section XML 문법·namespace, 제품 header·spine 구조, header 리소스 ID 색인, section 및 header 서식 참조, 언어별 글꼴·번호·글머리표·이진 리소스·차트 경로 연결 조사는 `zig test src/hwpx_structure_survey.zig -O ReleaseFast`로 명시적으로 실행합니다. 이 선택 조사는 Git에 추적되지 않는 로컬 `reference/rhwp` 클론이 있어야 재현됩니다. 수백 MB의 해제 XML을 읽으므로 기본 `zig build test`·`audit`에는 포함하지 않습니다. 묶음 실행은 큰 메모리 사용량으로 중단될 수 있어 `--test-filter 'HWPX corpus chart path and XML read-only survey'`처럼 corpus 항목별 단독 실행 결과를 구분해 기록합니다. 원본은 변경하지 않으며 선행 XML 관측은 [HWPX XML 구조 조사](hwpx-xml-structure-evidence.md), 제품 구조 검증 결과는 [header·spine 구조](hwpx-document-structure.md), ID 색인 결과는 [header 리소스](hwpx-header-resources.md), 참조 결과는 [section 서식 참조](hwpx-section-references.md)·[header 내부 참조](hwpx-header-references.md)·[글꼴 ID 참조](hwpx-font-references.md)·[번호·글머리표 참조](hwpx-list-references.md)·[이진 리소스 연결](hwpx-binary-references.md)·[차트 경로 검증](hwpx-chart-references.md)이 각각 소유합니다.

테스트용 문서 보고서의 기대 바이트 간격/필드 위치는 `tests/hwp5/document-report-wire.mjs`에서 공유합니다. 제품 serializer로부터 생성하지 않아 독립 대조를 유지하며, 다른 테스트에 구역 stride·필드 offset 숫자를 다시 복제하지 않습니다. 구역 인덱스 정렬 검증은 서로 다른 진단값을 가진 입력으로 수행합니다.

일반 컨테이너 보고서(mode 25)의 마지막 decoded bytes/uninspected streams 위치는 `tests/hwp5/container-report-wire.mjs`가 소유합니다. 선택적 추가 보고서를 붙이기 전의 기본 보고서에만 적용하며, 제품 serializer에서 기대 위치를 생성하지 않습니다.

`zig build line-cache-audit`는 변경 추적 병합 문단의 읽기 전용 실파일 조사와 조사 도구의 적대적 테스트를 실행합니다. 전체 `audit`에도 포함됩니다. 해석 범위와 실측은 [병합 줄 캐시 조사](hwp5-merged-line-cache.md)가 소유합니다.

`zig build history-xml-audit`는 별도 설치된 `xmllint`가 PATH에 있을 때 이력의 읽기 전용 XML 조사를 실행합니다. 자동 설치하거나 제품/WASM에 링크하지 않습니다. 외부 도구가 필요 없는 안전 경계 단위 테스트만 기본 `audit`에 포함하며, 실제 XML 조사는 명시적으로 실행합니다. 계약과 실측은 [이력 XML 조사](hwp5-history-xml-evidence.md)가 소유합니다.

[HWP5 문서 요약 property set](hwp5-summary-property-sets.md)의 타입·예약 필드와 다중 set 거부는 `zig test src/root.zig --test-filter 'summary typed value'` 및 `--test-filter 'HWP summary rejects'`로 검사합니다. 누락 코드페이지 관측 마커는 `--test-filter 'HWP summary missing-codepage'`로, 추적 실파일의 같은 진단은 `--test-filter 'tracked HWP summary fixture'`로 검사합니다. 파일 단위 통계 전달과 테스트용 mode 25/27 wire는 `zig build hwp5-audit -Doptimize=ReleaseSafe --summary all`에서 검사합니다. 전체 회귀는 아래 `zig build test --summary all`·`audit`를 따릅니다. 별도 읽기 전용 원시 필드 조사는 `node tools/hwp5-summary-reserved-survey.mjs --self-test` 후 `node tools/hwp5-summary-reserved-survey.mjs legacy/rust/crates/hwp-core/tests/fixtures reference/rhwp/samples`로 재현합니다. `zig build audit`로 테스트용 WASM을 생성한 뒤 같은 조사 명령의 디렉터리 앞에 `--probe`를 넣으면 실제 요약 스트림을 테스트용 요약 파서에도 대조하며 오류가 있으면 실패합니다. 이 조사는 제품 WASM의 CFB 조회를 사용하며, 문서 전체 검증은 아닙니다.

## PrvImage 조사

`zig build preview-image-audit --summary all`은 제품 WASM 빌드 후 조사 도구 테스트와 기본 HWP fixture의 읽기 전용 시그니처 조사를 실행하며 정규 audit에도 포함됩니다. 제품 이미지 검사 명령이 아닙니다. 범위를 넓히려면 빌드 후 아래 명령에 디렉터리를 명시합니다. 직접 자식 파일만 조사합니다. 계약·미구현 범위는 [PrvImage 형식 조사](hwp5-preview-image-evidence.md)에 둡니다.

`zig build doc-options-audit --summary all`은 DocOptions 관측 테스트와 기본 corpus 조사를 실행합니다. 확장 조사는 `node tests/hwp5/doc-options-survey.mjs legacy/rust/crates/hwp-core/tests/fixtures reference/rhwp/samples`로 재현합니다. 직접 자식 HWP 파일만 읽으며 내부 문서 경로는 출력하지 않습니다. 필드 검증과의 경계는 [DocOptions 조사](hwp5-doc-options-evidence.md)에 둡니다.

```sh
node tests/hwp5/preview-image-survey.mjs legacy/rust/crates/hwp-core/tests/fixtures reference/rhwp/samples
```

## 차트 Contents 관측

제품 WASM 빌드 후 루트에서 `node --test tests/hwp5/chart-contents-evidence.test.mjs`와 `node tests/hwp5/chart-contents-survey.mjs`를 실행합니다. 조사 범위와 의미 해석의 경계는 [차트 Contents 실측](hwp5-chart-contents-evidence.md)에 둡니다. 정규 audit와 별개의 읽기 전용 조사입니다.

`zig build chart-ownership-audit --summary all`은 SHA-256으로 고정한 실제 Contents 표본의 소유권·원본 복제·span patch·String 정의 편집·참조 분리/재파싱·OOM·모든 잘림·한도 오류 검사와 표본 모듈 생성기 테스트를 실행합니다. `-Doptimize=ReleaseSafe` 또는 `-Doptimize=ReleaseFast`로 같은 검사를 실행할 수 있으며 정규 `audit`에도 포함됩니다. 매 실행마다 기존 corpus에서 원본을 다시 확인하고 생성한 Zig 모듈은 빌드 캐시에만 둡니다. 필요한 표본이 없으면 다른 표본으로 대체하지 않고 실패합니다. 선택 배치와 검증 한계는 [Contents 조립](hwp5-chart-observed-contents.md), 원본 출력 계약은 [차트 원본 바이트 보존](hwp5-chart-source-preservation.md), patch 계약은 [차트 원본 span patch writer](hwp5-chart-patch-writer.md), 정의 편집 계약은 [차트 String 객체 편집](hwp5-chart-string-edit.md), 참조 분리 계약은 [차트 String 참조 분리](hwp5-chart-string-fork.md)가 소유합니다.

## 세 빌드 모드 회귀 검증

GIF의 macOS ImageIO 제3 구현 대조는 선택적 테스트이며 정규 audit나 제품 빌드에 Swift/CoreGraphics 의존성을 추가하지 않습니다. `swiftc tests/hwp5/gif-imageio-oracle.swift -O -o /tmp/hwpjs-gif-imageio-oracle`로 oracle을 빌드할 수 있습니다. stdin으로 GIF를 받고 프레임 RGBA JSON을 출력하며, `tests/hwp5/gif-imageio.mjs`의 compareGifImageIo가 단일 프레임/팔레트/크기 전제를 확인한 뒤 픽셀을 대조합니다. 대상과 결과는 [GIF 복호화 기록](gif-indexed.md)에 둡니다.

ICC 식별자 스냅샷의 생성 파일 일치는 `node tools/icc-registry/generate.mjs --check`, 추출·다운로드·스냅샷·생성 테스트는 `zig build icc-registry-audit --summary all`로 오프라인 검사합니다. 정규 audit에도 포함되며 자동 다운로드/갱신하지 않습니다. 원본 JSON 변경 후 생성기 stdout을 검토해 data.zig에 반영합니다. 계약은 [ICC 등록부 조회](icc-registry-lookup.md)에 둡니다.

언어 태그 등록 테이블은 `node tools/language-registry.mjs --check`로 오프라인 일치를 검사합니다. `--fetch`는 공식 IANA 원본으로부터 축약 JSON을, `--tables`는 로컬 source.json으로부터 파생 파일 내용을 JSON으로 표준 출력합니다. 두 명령 모두 파일을 자동 덮어쓰지 않습니다. 갱신 시 source.json과 파생 파일을 함께 검토·반영하고 전체 audit를 실행합니다. 계약은 [BCP 47 등록 검증](bcp47-registry.md)을 참고합니다.

공유 zig-out 산출물이 덮어써지지 않도록 아래 명령은 순차 실행합니다.

```sh
zig build audit --summary all
zig build audit -Doptimize=ReleaseSafe --summary all
zig build audit -Doptimize=ReleaseFast --summary all
```

수정한 테스트 Zig 파일도 zig fmt --check 대상으로 확인하고, 변경 JS 파일은 node --check로 검사합니다. 검사 횟수는 로그에서 확인하며 지원 범위와 동일시하지 않습니다.

소스 변이 검증은 각 변이를 독립 복사본에 적용하고 실행 직전에 그 복사본의 `.zig-cache`를 제거합니다. 같은 길이·같은 시각의 연속 변경이 이전 컴파일 결과를 재사용할 수 있으므로 최초 한 번만 cache를 지우는 것으로는 충분하지 않습니다. `--test-filter`를 사용할 때는 출력된 테스트 이름·개수를 확인하며, root import의 lazy declaration 때문에 전용 모듈 테스트가 수집되지 않으면 해당 Zig 파일을 직접 실행합니다.

ReleaseFast의 누수 검증을 std.testing.allocator의 기본 안전 검사에만 의존하지 않습니다. 특히 기대한 파싱/검증 오류를 잡아 성공으로 반환하는 테스트는 OOM 주입 검사와 별도로 정상 할당 후 오류 경로의 해제량을 확인합니다. 명시적 할당 회계 또는 safety=true인 검사 할당자를 사용하며, 실제로 해제 코드를 제거한 변형이 각 모드에서 실패하는지 확인합니다. Zig 0.16에서 확인한 재현과 보강 근거는 [BMP 적대적 검증](bmp-pixels.md)에 둡니다.

WASM 거부 테스트는 임의 예외나 메시지만으로 성공을 판정하지 않습니다. 파서가 반환한 정상 오류의 종류와 기대 오류명을 확인하고, WebAssembly.RuntimeError 및 호스트 TypeError/RangeError는 테스트 실패로 남깁니다. 독립 oracle도 의도한 검증 실패와 자체 실행 오류를 구분합니다. 실제 trap 주입이 거부 통계에 숨었던 재현과 방어 검사는 [BMP RLE 검증](bmp-rle.md)을 참고합니다.
