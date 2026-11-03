# 그림 대기 중 문단 측정 캐시 보존

## 지원 후보와 책임

그림 자원의 새로고침과 문단 측정 캐시의 보관 수명을 구분한다. 원본 그림이 아직 없는 제한 조건에서 불필요한 캐시 폐기를 피하는 계약이며 검증 기록에서는 이 후보를 E로 구분한다. `picture-resources.mjs`는 실제 private bitmap·오류·refresh/version·decode/bytes 수명을, `renderer.mjs`는 현재 Native 연속성·provider 계약과 geometry 보존 여부를 소유한다. source 관측과 prepare의 현재 membership/host 검증은 기존 Native 경계에 남는다. 새 Native 권한을 발급하지 않는다.

같은 문서·검증된 Native 연속성·stable provider 아래 실제 raw bitmap이 모두 null인 제한 경로만 다룬다. 표시 projection의 null을 실제 bitmap 부재로 추정하지 않는다. 실제 bitmap이 하나라도 있거나 mixed·unknown이면 추가 null 보존 조건을 적용하지 않는다. 이 경우 모두 clear한다는 뜻은 아니며 이미 정상 settled 조건으로 유지되던 경로는 그대로 둔다. refresh/decode 재시도·오류·버전 폐기는 유지한다. decoded epoch·font·폭/DPR·provider·문서·close 무효화를 제거하지 않는다. 완료 callback과 safe flush/paint의 연결 범위를 넘어 현재 화면 전체 정합성을 단정하지 않는다.

## 확인 범위와 남은 한계

root의 명시4파일은 신규18+기존29=47pass·0fail·0skip이다. 기존29를47에 다시 더하지 않는다. 실제 resources/gate/epoch/prepare의 source 검사이며 whole renderer·Native 검사가 아니다. 새 served SDK namespace의 canonical152와 별도 renderer body3도 각각 다른 검증 기록이다. 세 범위를 합산 총계나 동일 종류의 통과로 표시하지 않는다. body3는 통제 registry·mock Canvas·표 없음 범위이며 실제 visible bitmap 획득·Native·브라우저 검사가 아니다. 과거 oldraw SDK 바이트를 복구한 것이 아니며 그 성공 기록을 현재 전체 입력에 승계하지 않는다.

별도 Native 검사는 같은 served SDK에서 E 단독과 E+page의 단일 load/edit/undo, strict6쌍98rows·40boxes·4pages 동치를 확인했다. 자연 settled=false·raw bitmap 모두 null에서 E rebase1을 유지했다. 이는 E 단독 대 무수정 baseline의 성능 비교나 실제 Canvas/pixel 검증이 아니다. 이전 metadata 연속성 양성에도 clear/rebase가 발생한 실패 기록은 보존한다.

그림 대기 중 캐시 보존의 실제 브라우저·다양한 resource 전이·비용·일반 성능 효과는 아직 미확인이다. root source 반영은 시험·커밋·배포 완료와 다르다. source/correctness 통과만으로 지연 개선·전체 O(N)·전체 조판 완료를 주장하지 않는다.

페이지 prefix는 별도 미채택 실험이다. source 비용 비교에서 A3.83075/B4.3225ms, 중앙값 약12.84% 악화였고 AB/BA 양 순서 모두 불리했다. 이 비용은 Native CPU·브라우저 입력 지연이 아니다. E 수명 정책의 기여를 page 효과로 계수하지 않으며 page source나 새 정규 명령을 이 후보 계약에 포함하지 않는다. page는 source prefix 앞부분만 건너뛰고 suffix는 EOF까지 재조판하던 실험으로, 전체 영향 구간 최소화나 suffix 수렴 완료가 아니다.
