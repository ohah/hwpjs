# PNG 감마·색도 원값 검사

## 계약과 책임

기준은 [PNG 3 권고안](https://www.w3.org/TR/2025/REC-png-3-20250624/)의 §7.1, §11.3.2.1~2와 §5.6 표 7입니다.

- `src/image/png/color_fixed.zig`는 공통 big-endian unsigned PNG 정수 읽기와 배율 100000을 소유합니다. 범위는 0..0x7fffffff이며 부동소수점으로 변환하지 않습니다.
- `gamma.zig`는 정확히 4바이트인 gAMA의 scaled 원값을 해석합니다.
- `chromaticities.zig`는 정확히 32바이트인 cHRM의 white/red/green/blue 순서별 x/y를 해석합니다.
- `metadata.zig`는 각각 최대 한 번, PLTE와 첫 IDAT 이전이라는 규칙을 소유합니다. 파싱 실패 시 값과 검증 카운터를 갱신하지 않습니다.
- `pixels.zig`는 기존 순회에서 검사기를 조립하고 optional 값과 `color_semantics_deferred`를 보고합니다. 추가 힙 버퍼나 입력을 참조하는 포인터는 없습니다.

부재(null)와 값 0은 다릅니다. 원시 정수 0도 보존하며, 감마 보정에 사용할 수 있다는 뜻은 아닙니다. 색도 좌표의 합·색역·행렬 가역성·백색점 사용 가능성도 이 단계에서 인증하지 않습니다. 두 청크 중 하나라도 있으면 `color_semantics_deferred=true`입니다. 구조 검사 성공으로 ancillary deferred 개수에서 제외되더라도 색상 의미 검증 완료로 바꾸지 않습니다.

sRGB 동반 시 정해진 gAMA/cHRM 값과의 대조는 [sRGB 검사](png-srgb.md)가 소유합니다. iCCP/cICP와의 우선순위, ICC 해석 및 실제 색상 변환은 후속 범위입니다. 이 문서는 PNG 전체 색상 지원 완료를 주장하지 않습니다. 제품 JS API는 변경하지 않았습니다.

## 독립·적대적 검증

`tests/hwp5/png-color-fixed-evidence.mjs`는 제품 코드와 분리한 Node 정수 읽기·청크 위치 대조를 사용합니다. 테스트 전용 mode 141은 14개 u32 LE를 반환합니다: gamma 존재/원값, cHRM 존재/8좌표, 색상 의미 보류, ancillary 보류 청크/바이트 수. 기대값은 제품 serializer로 생성하지 않습니다.

`png-color-fixed.mjs`는 서로 다른 8좌표, 0·최댓값·상위 비트 경계, 잘림·초과 길이, 36개 payload 바이트 위치별 256값(9,216개 변형), 중복, 5청크의 120개 배치 순열, 모든 PNG 색상 유형, 파일 한도와 오류 후 복구를 검사합니다. 기존 HWP fixture의 PrvImage도 동일한 독립 기준으로 비교합니다. 실제 fixture에 해당 필드가 존재하는지와 합성 입력 검증은 구분합니다.

네이티브 테스트는 원값/부재 구분, 실패 시 State 보존, 정상·손상 입력의 모든 할당 실패 지점 정리를 포함합니다. 2026-09-07 새 테스트를 포함한 `zig build test --summary all` 394/394 통과를 확인했습니다. 이어 Debug/ReleaseSafe/ReleaseFast 전체 audit를 순차 실행하여 각각 17/17 단계, 네이티브 394/394, 감사 스크립트 3,760,113 checks 통과를 확인했습니다. 로그는 `/tmp/hwpjs-png-color-fixed-{Debug,ReleaseSafe,ReleaseFast}.log`입니다. 포맷·변경 JS 문법·로컬 문서 링크 51개도 확인했습니다. 이 결과는 미구현 색상 의미나 전체 HWP 명세 검증을 대신하지 않습니다.

같은 날 새 WASM mode 141로 전용 비교를 실행하여 정상 8,189건·거부 9,527건을 확인했습니다(정상 입력의 한도 부족 재검사는 거부 수에 포함). 실제 HWP 미리보기 PNG는 32개이며 모두 gAMA 원값이 일치했습니다. 이 실파일에는 cHRM이 없으므로 실제 색도 청크가 있는 파일까지 검증했다고 주장하지 않습니다.

## 외부 PNG 비교

2026-09-07 [PngSuite 미러 고정 리비전](https://github.com/lunapaint/pngsuite/tree/8cd768dd0d0063195174d0d01cacbd5a7d1e5605/png)의 `g{03,04,05,07,10,25}n{0g16,2c08,3p04}.png` 18개를 메모리로 내려받아 검사했습니다. 파일을 저장소나 제품에 편입하지 않았습니다. 각 그룹의 gAMA 원값은 35000/45000/55000/70000/100000/250000이며 mode 141의 모든 보고 필드와 mode 130의 복원 행 바이트가 독립 JS 기준과 일치했습니다. 이 외부 파일에도 cHRM은 없습니다. 자동 audit 수에는 이 수동 실행을 합산하지 않습니다.

재현 주소는 `https://raw.githubusercontent.com/lunapaint/pngsuite/8cd768dd0d0063195174d0d01cacbd5a7d1e5605/png/<파일명>`입니다. 아래 SHA-256으로 입력을 식별합니다.

추가로 같은 리비전의 `ccwn2c08.png`(1,514바이트)와 `ccwn3p08.png`(1,554바이트)에서 실제 cHRM을 확인했습니다. 두 파일 모두 gAMA=100000, white=(31270,32900), red=(64000,33000), green=(30000,60000), blue=(15000,6000)이며 mode 141의 모든 필드 및 mode 130의 복원 행 바이트가 일치했습니다. 두 파일의 색상 의미 보류는 true, 미검사 ancillary 청크/바이트는 0입니다. sRGB 청크는 없으므로 sRGB 동반 감마 규칙 검증 사례는 아닙니다. 외부 PNG 비교는 이 두 파일을 더해 총 20개이고, HWP 내부 cHRM 사례를 확보했다는 뜻은 아닙니다.

| 파일 | SHA-256 |
|---|---|
| g03n0g16.png | 3494b914dd1b094afa9a74a89bfa75219030e21af6fca3ed66c9d45032a047e9 |
| g03n2c08.png | abce774b9624952c2d0c57ff681790ba620cf5616fe7e0ef0600600cdce3c22a |
| g03n3p04.png | 541389db0c72721c6c49501e1dbf6e32df41b4fcfa318676955e278f3f4332b3 |
| g04n0g16.png | 72350a2d9db2df09b626f1f1dd48061e9c749d471bf19814d2c5c10acbf007e5 |
| g04n2c08.png | bfd3edfc4d85a43383556a51023533fa3888184aa53a6b43769910782beebfce |
| g04n3p04.png | 5ea85ebefb58b2ab113fc05bf1cb79ffb068359e3a5620843590a0a7b59bd49a |
| g05n0g16.png | be19721d28e0b268af1e29e8190c952b94315bd08899383ae2c91e6dc8c4f889 |
| g05n2c08.png | 74ab5b8477992d65e220eeaff8df466522c1b392fa90c6f9935da5bdb7113c9d |
| g05n3p04.png | 2f46afd7ec15836b523cbce6965f34d89833b8d777afffaf0f53bce620d5f65e |
| g07n0g16.png | 9070f843981f765cc8e26a63751be5d58631d85a8a7b4e826358f80e8a679d03 |
| g07n2c08.png | ca4cd32d222f65fb7beb7c9f40d8b6833b36d552b830ff1a1d67dae73b8ed0d8 |
| g07n3p04.png | b8e7abeabcfd50b71cca78b6cdff7372310cfc179cd63304c3e904f469b333cb |
| g10n0g16.png | a22486acb74ee5f947db3a20b1f314a9dd8aca3339840049ee559f4d676a6b5c |
| g10n2c08.png | 4ac23729aea109e8f6b1e831448115cf02dcd97559e9403847cbe6dd7e5c7347 |
| g10n3p04.png | 36cc2ea4b5b33cd18e0a01c7de85dbcaf7161d258cd0f2265a90cd835b15cf6d |
| g25n0g16.png | 1fae707d809296d2cf0d6aa653bead6199644fb1c859558ec7d2d69e709a423a |
| g25n2c08.png | 9b128cfa1bb417dd99251914d729062621fcea9f346168549b16a75fe030b0f6 |
| g25n3p04.png | 4197a0a25c4f74d42c2285d75b9fabe1eedbed45bc224ff1ec1784f5797e9dbf |
| ccwn2c08.png | c88909e74e039dd3df829bf24144b487171e53b17f5c5c07cbc08688247d24b5 |
| ccwn3p08.png | dc365b39d49c287669d837872dd59aef30763a611dfc8c046c481e35e49a390a |
