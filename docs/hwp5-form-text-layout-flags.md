# 양식 AutoSize의 측정과 편집

## 표시·편집 계약

HWP5/HWPX 양식 AutoSize의 JS 표시·편집은 12개 runtime 모듈이 담당합니다.
측정 provider·frame·face geometry, HWP5/HWPX 표시 연결, Canvas controls와 DOM draft 편집 경로를 포함합니다.
이 변경은 Native ABI·값 쓰기·저장·history 권한을 추가하거나 확장하지 않습니다.
표시용 측정 geometry와 원본 저장 frame을 분리하며, AutoSize가 아닌 기존 동작은 유지합니다.
Canvas provider는 현재 font와 전체 문자열의 TextMetrics로 표시 크기를 계산합니다.
painter의 실제 textOffset과 기존 clip·콤보 오른쪽 예약 폭을 줄바꿈 가용 폭에 반영합니다.
측정 receipt는 현재 owner/epoch에서만 유효하며, 유효한 receipt로 DOM 편집 padding과 content origin을 설정합니다.

현재 권한이 있는 painted 대상에서 font/draft 측정만 불가능하면 기존 표시/source geometry로 입력을 유지합니다.
이때 resize 미지원 상태를 구분하며, 새 측정 epoch의 유효한 receipt가 준비되면 측정 geometry로 복귀합니다.
좁은 상자는 편집 DOM에 예약 폭과 1ch의 최소 입력 공간·가로 스크롤을 제공하고 원본/painted frame은 바꾸지 않습니다.
readonly·stale·foreign·유효하지 않은 owner 및 Native binding 거부는 기존 권위에 따라 계속 거부합니다.
없는 lineHeight나 실패한 측정치를 임의 치수로 보충하지 않으며, 표현할 수 없는 geometry는 미지원으로 남깁니다.

## 검증 범위

Main은 동일 17경로를 적용한 현재 Root에서 AutoSize 60개와 별도 EOL 회귀 9개가 각각 exit0임을 확인했습니다.
r11 격리 공개 SDK의 정상 loader·기존 Native879·실제 provider·controlled Node Canvas metrics 경로는 NEW 자체 작성 HWP5/HWPX 8개가 통과했습니다.
소스 회귀는 측정 실패 중 입력/submit, owner 거부, selection/composition 유지와 epoch 복귀를 검사하며, NEW8은 flags·권한·text·source frame·history·입력 대비 save 불변을 검사합니다.
실제 브라우저·제공 폰트·커서/selection·focus·IME·overflow·편집/history/save는 검증 대기입니다.
Node geometry와 raw flag 보존을 DOM/Canvas 또는 한글 조판 동치로 확대하지 않으며, GUI·배포 완료도 뜻하지 않습니다.
