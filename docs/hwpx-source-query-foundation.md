# HWPX 객체 원값·선두 쪽 번호 조회 기반

## 게시 범위

OLE source query는 원본 geometry/position/flow·binary item ID·object type·draw aspect·moniker 선언과 현재 보호 앵커를 반환한다. 공통 shape scalar decoder와 native component reader를 재사용한다. JS `oleSites(section)`/`oleSource(section,node)`와 선택적 WASM ABI 두 개를 제공하고, 구형 ABI 부재를 빈 객체 목록으로 합성하지 않는다. 원본·현재 위치·표시 불가를 구분한다.

이 기반의 OLE 현재 앵커는 직접 run/p host만 처리한다. 차트 대체 분기 연결·binary payload 조회·transform identity·OLE 그림 표시·감싸기는 후속 범위다. Worker는 paintable=false를 유지하며 물리 페이지 합성이 불가능하면 명시적으로 거부한다. 저장이나 문서 표시의 미지원 범위를 숨기지 않는다.

쪽 번호 조회는 첫 구역의 선두 PAGE restart 한 개만 기존 metadata 판정으로 증명한다. 보이는 내용·알 수 없는 앞선 객체·뒤쪽/중복 restart·지원되지 않는 선언은 물리 쪽 번호 supported로 올리지 않는다. 여러 구역의 이후 번호 상속이나 중간 재시작 조판을 추정하지 않는다.

## 검증 (2026-10-20)

고정 native tree `a5f8c3d3c4abfc406479e922b702a31a298e487d`의 무필터 ReleaseSafe 전체 검사는 exit0·7/7 단계 성공·4,188/4,189 통과(1 skip)다. 제품 빌드5/5, WASM `3f9236a6a4b7b4fe176baa6189b82745c657f53cb92861dca332e99ea2be22ae`를 검증했다. 종료 뒤 source/index 및 제품 해시 불변을 확인했다. 전체 skip을 통과로 세거나 후속 후보까지 검증했다고 주장하지 않는다.

현재 main의 별도 archive에 해당21개 코드/테스트 파일만 적용했다. native src/build는 위 고정 tree와 일치하고, 이후 main의 WASM loader deadline·회귀 테스트·문서는 되돌리지 않았다. 최초 diff 대조는 private index에 새 파일을 등록하기 전이라 untracked 파일을 삭제로 표시했고, 정확한 경로를 private index에 추가한 뒤 native tree 일치를 다시 확인했다. 사용자 작업 트리나 스테이징 파일을 비교에 맞춰 바꾸지 않았다.

분리 사본의 ole-source-api/ole-source-worker/wasm-module-loader/preview-wasm-compression/shared-wasm-worker 다섯 파일12/12·skip0을 통과했다. 실제 numeric OLE 문서의 독립 XML node/ID/폭 대조, 앞😀 입력의 UTF-16 앵커1→4, 원본 보존·독립 normal/-O 저장 및 음성 대조·undo/redo·재열기, 구형 기본 바이너리에서 명시적 API 부재, 다운로드 대기 제한과 모듈 공유/압축 회귀를 포함한다.

분리 main에서 새로 실행한 ReleaseSafe 제품 빌드도5/5다. 산출물 `e67a727d83fe99df77022c2d6a9feebec2b06ee54e8ab10e2850c11ed162bab3`는 기존3f9236a6와 모든 실행/데이터 섹션 및 나머지 custom section이 바이트 동일하며 경로를 포함한 DWARF만 다르다. 새 산출물로 위12개도 다시 통과했다. 전체 native 결과를 다른 실행 코드에 적용한 것이 아니다.

이는 HWP5/HWPX 전체 픽스쳐의 모든 필드·편집 위치·물리 페이지 완료가 아니다. 후속 차트 표시/rich/선 원값 후보와 기본 데모 바이너리는 별도이며, 이 소스 게시만으로 후속 후보나 데모 승격을 완료 처리하지 않는다.
