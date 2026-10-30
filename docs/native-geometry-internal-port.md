# 내부 기하 읽기 포트

`@hwpjs/core/_internal/native-geometry`는 불안정한 빌드 내부 계약이다. 공개 root API나 DTO 스키마를 확장하지 않는다. 읽기 함수 `readGeometryProjection(lease, state)`와 `readNativeGeometryEvidence(evidence, content)`만 제공한다. 발급·등록·setter는 내부 모듈에 남는다.

core root와 내부 entry는 같은 공식 dist의 공유 chunk를 사용해야 한다. 서로 다른 core 사본의 registry를 섞으면 권위를 얻지 못하고 일반 경로로 돌아간다. 임의 runtime·worker·외부 DTO는 권위의 근거가 아니다.

공식 core producer로 dist를 먼저 만든 뒤 명시 검사한다.

```sh
test -f ./packages/core/tests/integration/native-geometry-dist.test.mjs || exit 1
HWPJS_TEST_CORE_DIST="$PWD/packages/core/dist" bun test ./packages/core/tests/integration/native-geometry-dist.test.mjs
```

환경 변수가 없으면 이 dist 전용 검사는 skip한다. 명시 실행에서 skip은 완료 근거가 아니다. 검사는 실제 dist의 공유 registry와 독립 사본 거부를 인위적인 내부 origin으로 확인한다. Native 권위·Worker·Canvas 성능 증명이 아니다. cb48은 이 후보의 알려진 Native 기하 권위 대상이 아니므로 일반 fallback을 유지한다.

선택 source와 `_internal` JS/DTS를 포함한 공식 dist를 함께 적용한다. 기존 dist는 적용 전에 소유 백업으로 보존한다. 앱 전체 검증과 이전의 더 넓은 SDK 검증은 별도 범위다.

정확 d849의 한정 Native 계약, full snapshot·warm provider 및 controller 파생 history 경계는 [HWP5 full snapshot exclusive 증거](hwp5-full-snapshot-exclusive.md)를 따릅니다. 이 연결 자체가 Native 호출 감소·실브라우저 성능·SDK/운영 적용을 증명하지 않습니다.
