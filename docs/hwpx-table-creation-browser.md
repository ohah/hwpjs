# 게시 소스의 표 생성 브라우저 검증

2026-10-11 published5610e494를 `/tmp/hwpjs-table-ui-release.UVKq48`에 git archive로 추출하고 원본/현재 Git diff가 없는 상태에서 ReleaseSafe build를 수행했습니다. WASM SHA256은 `a87ee487658b6ad9086f865360c22f24d1b93a574c7706ed6271366392e40c18`입니다. dirty 후보6c59 결과를 이 산출물에 소급하지 않습니다.

같은 archive의 공개 생성/Worker/form/geometry/HWPX history/HWP5 editor/history7파일23/23·fail/skip0·exit0(3101.174875ms)을 확인했습니다. 실제 Chromium은 loopback10005의 같은 source/artifact를 읽었습니다. charshape.hwpx를 업로드해 편집 시작→진하게 찾기→ArrowLeft로 범위 접기→삽입 메뉴/설정 폼→2×2 생성→첫 셀 새 표😀<& 입력→다운로드→undo/redo→다시 다운로드→다운로드 파일 재열기를 수행했습니다. 초기 설정은 실제 paragraph0/character0/style0/border1이고 UI는 첫 셀 포커스를 복원했습니다.

undo 관측은 새까지 되돌아갔으며 redo는 전체 입력을 복구했습니다. browser typing이 한 native 거래라고 주장하지 않습니다. 두 다운로드는 cmp exit0으로 byte-identical이고, 재열기에서 새 표 검색1/1과 정확한 셀 텍스트를 확인했습니다. browser errors 출력은 비었습니다. 물리 IME/실제 한글 프로그램 조판은 검증하지 않았습니다.

독립 Python ZIP/XML 검사는 entry 순서/CRC·section0 외 모든 payload 보존, 생성 표 하나·2행2열·4셀 텍스트와 고유 문단 ID1/2/3/4를 확인했습니다. 전체 section XML 의미/모든 필드/캐시 조판을 대조한 oracle는 아닙니다.

agent-browser 스킬의 scoped QA로 브라우저 동작과 증거를 수집했습니다. 다운로드 명령이 toolbar 밖 버튼을 Canvas에 가려진 것으로 보고했지만 scrollintoview 후 정상 동작했습니다. 초기 undo generic locator/wait는 완료를 입증하지 못했고, 보이는 실제 버튼과 완료 상태를 확인해 성공을 검증했습니다. 재현되는 제품 결함으로 확정하지 않았습니다. 보고서와 screenshots/다운로드는 `/tmp/hwpjs-table-ui-release.UVKq48/qa/`에 보존했고 소유 브라우저 세션은 종료했습니다.

게시 source의 추가 native 집중 allocation/history 검사는 별도 실행 중입니다. 기본/외부 데모 WASM은 아직 교체하지 않았습니다. 원본 inline/쪽 배치·host 재배치·생성 셀 서식/구조·HWP5 생성 및 전체 fixture 편집/파서 목표는 여전히 미완료입니다.
