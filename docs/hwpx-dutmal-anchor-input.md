# 덧말 보존 앵커와 주변 본문 입력

## 모델 경계

실제36389301의26번 문단은 mainText `팀단위 훈련`과 subText `전술훈련 30% + 현지훈련 20%`를 가진 run 직접 dutmal입니다. RHWP의 parser/hwpx/section.rs도 별도 Ruby 컨트롤에 두 문자열을 보존하고 문단 텍스트에는 컨트롤 표식을 넣습니다. 우리 inline_string_controls 보고서 역시 두 문자열/속성/원문을 독립적으로 읽습니다. 본문 텍스트에 주석을 합치거나 두 문자열 중 하나를 버리지 않습니다.

run_anchor에 dutmal 종류를 추가해 기존 보호 앵커 위치·범위·문자열 splice·필드 거래·저장을 재사용합니다. 정확한 paragraph namespace와 직접 run/paragraph 소유권이 필요합니다. 덧말은 표시 좌표의 보호 단위 하나이며 payload를 평문 t로 변환하지 않습니다. mainText/subText 내부 문자열 편집·Ruby 배치·szRatio0의 의미 해석은 아직 지원 완료가 아닙니다.

## 실제 필드 소유권

이 문단은 앞 문단에서 시작한 CLICK_HERE 누름틀의 내용입니다. 초기 테스트가 일반 anchorText를 요청했을 때 UnsupportedStructuralFieldEdit로 실패한 것은 정상 보호였습니다. fieldLabels와 명시적 라벨 입력 경로를 사용하며, 일반 canEdit/anchorText 제한을 해제하지 않습니다. 독립 XML 관측상 덧말 앞 본문은43 UTF-16단위이고, 보호 앵커1과 뒤 본문7을 포함한 라벨 범위는0..51입니다.

## 검증과 남은 일

ReleaseSafe 빌드6/6 exit0, 후보 SHA256 `8c302fcd302a5fb677951df6ccc167df2cbda056dc990ef44d3e53c5db84f716`입니다. native2/2 exit0은 namespace/소유권 반례와 실제 main/sub 문자열 조회·앵커 삭제 거부·필드 내용 입력·저장 재열기 후 dutmal raw XML byte-exact·문자열/불변 source 보존을 검사했습니다.

공개 dutmal/reference BOOKMARK 회귀2/2 exit0에서 실제 prefix 입력·보호 삭제 거부·독립 전체 section XML/비대상 ZIP normal/-O·잘못된 기대값 거부·undo 원문/redo 수정본 byte-exact·재열기를 확인했습니다. 같은 후보의 runless Worker2사례도 별도 통과했습니다. 기본 등록 누락 검사1/1 exit0, 전체 fmt exit0입니다. 공개 거래 전체 실패 할당·Worker/브라우저의 덧말 표시·내부 문자열 편집·서식/구조·최신 전체 gate와 native 코드 게시/제품 승격은 남습니다.

동일 후보의 opengov21파일2614문단 prefix 조회는 plain1643·anchored123·field848·거부0·파일 읽기 실패0, 종료코드0입니다. 이는 이 부분 집합의 입력 경로 조회이며2614문단 실제 편집/저장, 전체 참조 corpus 또는 한글 조판 완료를 의미하지 않습니다.
