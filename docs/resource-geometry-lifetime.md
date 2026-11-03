# 그림 대기 중 문단 측정 캐시 보존

## 지원 범위와 책임

그림 자원의 새로고침과 문단 측정 캐시의 보관 수명을 구분한다. 원본 그림이 아직 없는 제한 조건에서 불필요한 캐시 폐기를 피하는 계약이며 검증 기록의 E는 이 변경을 가리킨다. `picture-resources.mjs`는 실제 private bitmap·오류·refresh/version·decode/bytes 수명을, `renderer.mjs`는 현재 Native 연속성·provider 계약과 geometry 보존 여부를 소유한다. source 관측과 prepare의 현재 membership/host 검증은 기존 Native 경계에 남는다. 새 Native 권한을 발급하지 않는다.

같은 문서·검증된 Native 연속성·stable provider 아래 실제 raw bitmap이 모두 null인 제한 경로만 다룬다. 표시 projection의 null을 실제 bitmap 부재로 추정하지 않는다. 실제 bitmap이 하나라도 있거나 mixed·unknown이면 추가 null 보존 조건을 적용하지 않는다. 이 경우 모두 clear한다는 뜻은 아니며 이미 정상 settled 조건으로 유지되던 경로는 그대로 둔다. refresh/decode 재시도·오류·버전 폐기는 유지한다. decoded epoch·font·폭/DPR·provider·문서·close 무효화를 제거하지 않는다. 완료 callback과 safe flush/paint의 연결 범위를 넘어 현재 화면 전체 정합성을 단정하지 않는다.

## 확인 범위와 남은 한계

root의 명시4파일은 신규18+기존29=47pass·0fail·0skip이다. 기존29를47에 다시 더하지 않는다. 실제 resources/gate/epoch/prepare의 source 검사이며 whole renderer·Native 검사가 아니다. 새 served SDK namespace의 canonical152와 별도 renderer body3도 각각 다른 검증 기록이다. 세 범위를 합산 총계나 동일 종류의 통과로 표시하지 않는다. body3는 통제 registry·mock Canvas·표 없음 범위이며 실제 visible bitmap 획득·Native·브라우저 검사가 아니다. 과거 oldraw SDK 바이트를 복구한 것이 아니며 그 성공 기록을 현재 전체 입력에 승계하지 않는다.

별도 Native 진단은 자연 settled=false·raw bitmap 모두 null에서 그림 자원 수명 변경의 rebase1 유지를 확인했다. 이는 무수정 baseline과의 성능 비교나 실제 Canvas/pixel 검증이 아니다. 결합한 페이지 후보의 전체 출력 대조와 이전 실패 이력은 아래 별도 실험 기록에서 구분한다.

실제 Vanilla QA에서 기준·수정 버전의 HWP5 각각 trusted 입력80 → 키를 누른 상태의 undo40(repeat39) → 즉시 r 입력을 확인했다. 기대한 최초40문자+r, 커서43, 포커스와 현재 paint가 일치했다. 1280×633/DPR1의 최종 PNG도 두 버전에서 바이트가 같았다. 이는 지정 화면의 비교이며 문서 전체 픽셀 동치가 아니다. 수정 버전의 HWPX는 입력8 → undo8 → 원문·커서2 복원 → r 재입력·커서3을 확인했다.

같은 수정 번들을 사설 데모에 반영한 뒤 실제 HTTPS 주소에서 HWP5·HWPX 각각 입력8·undo8·재입력의 기능 회귀를 다시 통과했다. 각 검사 브라우저의 비활성·pid null과 실제 잔류 프로세스 없음도 확인했다. 공개 페이지 배포와는 별도 기록이다. 그림이 모두 준비된 일반 회귀의 성공을 미완료 그림 분기 자체의 브라우저 활성 증거로 해석하지 않는다. 다양한 resource 전이·일반 성능 효과·실OS IME·전체 조판 완료는 이 검증의 범위가 아니다. 추가 Native 조회나 CPU 프로파일 없이 기능을 확인했으며 새 지연 개선율을 측정한 결과는 없다.

페이지 prefix와 후속 체크포인트 실험의 계약·정합성·비용 및 미채택 근거는 [페이지 prefix 배치 실험](page-prefix-layout-experiments.md)에서 별도로 관리한다. 그림 자원 수명 변경의 효과와 페이지 실험의 효과를 합산하지 않는다.
