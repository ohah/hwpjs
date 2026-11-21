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

## Anchored picture examples: source-only 131 to 133 successor

The active policy candidate appends only `anchored-picture.hwp` and
`anchored-picture.hwpx`, two pre-edit derivatives of the existing approved
`picture-resize.hwp` and `picture-resize.hwpx` examples. The former 131-file
policy is preserved byte for byte as `public-gallery-fixtures-131.json`.
The historical 126, 128, 129 and vertical-margin receipts remain unchanged.
Earlier count-specific sections describe their respective historical cohorts.

`anchored-picture-fixture-receipt.json` binds exactly the 131-file base manifest,
the two parents, the two new files, the target policy and the catalog bytes.
`anchored-picture-fixture-provenance.json` records bounded independent parent
and resize-save checks. The edited reference saves are not public assets.
The HWP5 example includes repository-owned synthetic body text and source layout
caches; this does not establish fresh reflow or successful default saving.
When saving requires stale-layout consent, use the existing visible consent flow.
The HWPX derivative changes only the existing picture positioning attributes.
No external image, font, implementation or private example is added.

The Pages picker receives public IDs and labels through the existing
`publicFixtureModules(policy)` build boundary. Do not append files to a generated
gallery, hand-edit its manifest, or weaken the baseline validator. Until the
133-file bundle is adopted, rebuild from the exact 131-file baseline with the
registered extension and a separately qualified anchored-picture SDK source and
WASM. The policy patch alone does not qualify that product source or WASM.

```sh
node tools/build-public-demo.mjs \
  --source zig-out/verification/QUALIFIED-anchored-source \
  --wasm /absolute/pinned/anchored/hwpjs.wasm \
  --out zig-out/verification/NEW-anchored-gallery133 \
  --fixture-extension "$PWD/tools/pages-demo/anchored-picture-fixture-receipt.json"
node tools/build-pages-demo.mjs \
  --bundle-dir zig-out/verification/NEW-anchored-gallery133 \
  --fixture-policy tools/pages-demo/anchored-picture-fixture-policy.json \
  --out zig-out/verification/NEW-anchored-pages133
```

These commands are a handoff recipe, not evidence of a build or publication.
Activate policy, source metadata and the exact official 133-file output together.
An ordinary producer still rejects a 131-file public baseline against the new
133-file policy; that strict mismatch remains intentional.

## HWP5 가로 묶은 막대 차트

`hwp5-horizontal-chart-fixture-receipt.json`은 보존한 133개 정책에
`hwp5-chart-create-horizontal-bar.hwp` 하나를 추가합니다. 기준 파일은
`image-insert-blank.hwp`입니다. 제품 브라우저에서 가·나·다 범주와
3, -2, 7을 입력해 만들고 저장한 파일을 사용합니다. 재열기 후 그리기 요소를
비교했고, 저장본의 OOXML 차트 방향·그룹화·계열 값과 내장 PNG를 독립 검사했습니다.

공식 생성기에는 이 영수증을 `--fixture-extension`으로 전달하고
`hwp5-horizontal-chart-fixture-policy.json`에 대조해 134개를 검사합니다.
목록, 원본 경로 메타데이터, 갤러리를 함께 갱신합니다.

## HWP5 기본 원형 차트

`hwp5-pie-chart-fixture-receipt.json`은 보존한 134개 정책에
`hwp5-chart-create-pie.hwp` 하나를 추가합니다. 기준 파일은
`image-insert-blank.hwp`입니다. 실제 브라우저에서 가·나·다와 1, 2, 3을
입력해 생성하고 저장한 파일입니다. 독립 CFB/XML 검사는 축 없는 단일 2D
원형 차트, 범주·값, 내장 이미지와 Worker PNG의 바이트 일치를 확인합니다.

공식 생성기에는 이 영수증을 `--fixture-extension`으로 전달하고,
`hwp5-pie-chart-fixture-policy.json`에 대조해 135개를 검사합니다.
