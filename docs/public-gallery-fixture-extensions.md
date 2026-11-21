# 공개 갤러리의 고정 파생 예제

HWP5 바깥 여백 예제는 이미 공개된 `picture-resize.hwp`와 `textbox.hwp`의 별도 파생본입니다. 활성 정책 `tools/pages-demo/public-gallery-fixtures.json`은 승인된128개 target 정책과 byte 동일합니다. 원본126개 정책은 `public-gallery-fixtures-126.json`에 byte 그대로 보존합니다. 원본 두 문서와 파생 두 문서의 bytes·ID를 바꾸지 않습니다. 파생본은 여백 편집 전의 SQUARE 작성 예제이며 자체 빈 문서나 최신 조판을 증명한 파일로 표시하지 않습니다.

`hwp5-outer-margins-fixture-receipt.json`과 `hwp5-outer-margins-fixture-policy.json`은 역사적126→128 확장의 고정 자료로 유지합니다. 영수증은 원본·파생본의 크기·SHA와 helper·emitter·실행 산출물·독립 raw 검증을 고정합니다. 작성에서 바뀐 스트림은 `BodyText/Section0`뿐입니다. 작성 중 명시적으로 사용한 stale-layout 허용과 내부 줄 배치 캐시의 한계를 제품 기본 저장 동의로 전파하지 않습니다.

## 현재128개 정책의 반영

기본 producer와 docs·정규 CI의 기존 generic 정책 경로는 현재128개를 검증합니다. 정책, catalog, 두 예제, manifest, 정상 SDK·UI·엔진 핀을 Main이 함께 반영해야 합니다. 정책 소스만 갱신하고 실제 공개 디렉터리가126개인 중간 상태는 기본 검증을 통과하지 않습니다. source-only 준비를 gallery 복사나 배포 완료로 읽지 않습니다.

```sh
node tools/build-public-demo.mjs \
  --source zig-out/verification/EXACT-source \
  --wasm /absolute/pinned/hwpjs.wasm \
  --out zig-out/verification/EXACT-gallery128
```

기본 경로는 현재128개 baseline을 사용하며 확장 영수증이나 파생 입력을 별도로 읽지 않습니다. producer는 선택된 정책으로 공개 inventory·URL allowlist·manifest의 fixture 목록을 생성합니다. 파일만 덧붙이거나 manifest를 수작업으로 고치지 않습니다.

`public-gallery-current-sources.json`은 현재128개 ID의 입력 경로와 활성 정책 SHA를 고정합니다. 기존126개는 공개 baseline 경로, 파생 두 개는 승인된 `tools/pages-demo/fixtures/` 입력 경로입니다. 확인되지 않은 commit을 sourceHEAD로 추측하지 않습니다. 실행할 checkout과 실제 bytes는 정책의 크기·SHA로 다시 인증해야 합니다. 기존 `public-gallery-sources.json`은 과거의 부분 source metadata로 byte 그대로 보존하며 현재128개 복원 명부로 사용하지 않습니다.

```sh
node tools/build-pages-demo.mjs \
  --bundle-dir zig-out/verification/EXACT-gallery128 \
  --fixture-policy tools/pages-demo/public-gallery-fixtures.json \
  --out zig-out/verification/EXACT-pages128
```

## 과거126→128 확장의 재현

이 모드는 원래 영수증의 정확한126개 manifest·catalog·기존 파일 전체가 baseline인 별도 소스에서 사용합니다. `--fixture-extension`을 지정하면 producer의 baseline 정책은 보존한126개 스냅샷으로 선택됩니다. 현재128개 공개 bundle에 같은 영수증을 다시 적용하는128→130 동작은 허용하지 않습니다.

```sh
node tools/build-public-demo.mjs \
  --source zig-out/verification/EXACT-source \
  --wasm /absolute/pinned/hwpjs.wasm \
  --out zig-out/verification/EXACT-historical-replay \
  --fixture-extension "$PWD/tools/pages-demo/hwp5-outer-margins-fixture-receipt.json"
```

기존 영수증 경로와 SHA,126개 baseline 전체, 새 두 파일의 크기·SHA와 공개 부모를 인증하는 검사는 유지합니다. 관련 없는 파일, 기존 ID 덮어쓰기, 경로·symlink·해시 변조를 거부합니다. 기존 확장 시험의126개와 영수증 hash 기대도 보존된 스냅샷을 대상으로 유지합니다. 새로운 활성화 시험은 현재128개와 원래126개의 엄격한 관계 및 CI·producer의 정책 선택을 따로 검사합니다.

## 집중 검사

```sh
node --test --test-concurrency=1 \
  tools/pages-demo/gallery-policy-activation.test.mjs \
  tools/pages-demo/fixture-extension.test.mjs \
  tools/tests/public-demo-fixtures.test.mjs
```

정책·메타데이터·합성 바이트 조립과 실패 원자성 검사입니다. `tests/tools/pages-demo-fixture-policy.test.mjs`는 현재 source-map과 정책 SHA를 확인한 뒤 실제 baseline bytes로 임시 gallery를 조립하는 별도 시험입니다. gallery 복사가 금지된 source-only 준비에서는 이 시험을 실행하지 않습니다. 전체 producer, Native, SDK, browser, 공개 복사·배포 및 한글 수용 검증과 각각 구분합니다.
