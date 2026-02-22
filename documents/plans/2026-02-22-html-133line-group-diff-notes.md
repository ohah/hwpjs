# 133줄 그룹 Fixture vs Snapshot diff 분석 노트

## aligns (133줄 diff)

### diff 요약
- **총 diff 라인 수:** 133줄 (fixture 2줄 vs snapshot 128줄 — 포맷 차이 포함)

### 1. `<link>` vs `<style>` 구간 (허용 차이)
- **Fixture:** `<link rel="stylesheet" type="text/css" href="aligns_style.css"></head>` — 외부 CSS 한 줄 참조.
- **Snapshot:** `<style>` 블록으로 인라인 CSS 수십 줄 (공통 클래스 .hce, .hme, .hls, .hpa, .cs0, .cs1 등 정의).
- **결론:** 허용 차이. 플랜 기준 `<link>`→`<style>` 변경만 허용.

### 2. 클래스명/접두사 차이 유무
- **Fixture·Snapshot 공통:** `hpa`, `hcD`, `hcI`, `hls`, `ps1`, `ps2`, `hsR`, `hsT`, `hs`, `hrt`, `cs1` 등 클래스명 동일.
- **접두사:** Snapshot에는 `ohah-hwpjs-` 접두사 없음(aligns는 `css_class_prefix: ""` 사용). 클래스명 자체는 동일.

### 3. 메타/head 차이 유무
- **Fixture:** `<meta http_quiv="content-type" ...>` (오타: `http_quiv`).
- **Snapshot:** `<meta http-equiv="content-type" ...>` (올바른 `http-equiv`).
- **기타:** Fixture는 한 줄로 minified, Snapshot은 줄바꿈·들여쓰기로 포맷팅됨. DOCTYPE 앞 BOM(﻿) fixture에 있음.

### 4. 본문 구조·인라인 스타일 차이 유무
- **본문 구조:** 동일 — `div.hpa` → `div.hcD` → `div.hcI` → `div.hls`, `div.hsR` 등 순서·클래스 일치.
- **인라인 스타일:** fixture와 snapshot 모두 `style="line-height:2.79mm;white-space:nowrap;left:0mm;top:-0.18mm;height:3.53mm;width:150mm"` 등 동일한 mm 단위 값 사용. 구조·스타일 값은 동일하고, 차이는 **head 구간**(link vs style, 포맷, meta 오타)과 **줄/공백 포맷** 뿐.

### aligns 결론
- **허용 차이:** link→style, 출력 포맷(한 줄 vs 여러 줄), BOM 유무.
- **수정 고려:** meta `http_quiv` → `http-equiv`는 fixture 오타이므로 snapshot이 맞음. 클래스·본문 구조·인라인 스타일은 이미 일치.

---

## page (133줄 diff)

### diff 요약
- **총 diff 라인 수:** 133줄 (fixture 2줄 vs snapshot 128줄)

### aligns와 공통 패턴
- **`<link>` vs `<style>`:** Fixture는 `<link rel="stylesheet" href="page_style.css">`, Snapshot은 인라인 `<style>` 블록. 허용 차이.
- **클래스명/접두사:** 동일 (hpa, hcD, hcI, hls, ps0, hpN, hrt, cs0, cs1 등). 접두사 없음.
- **메타/head:** Fixture `http_quiv` 오타, Snapshot `http-equiv` 정상. Fixture BOM(﻿), minified 한 줄; Snapshot 줄바꿈·들여쓰기.
- **본문 구조·인라인 스타일:** 동일 (hpa, hcD, hcI, hls mm 단위, hpN 쪽 번호 "- 1 -", "- 2 -" 등). 구조·스타일 값 일치.

### page 결론
- aligns와 **동일한 공통 이슈**: link→style, 포맷(한 줄 vs 여러 줄), BOM, meta 오타. 본문·클래스·인라인 스타일은 이미 일치.

---

## 결론: 공통 이슈 및 전략

### 공통 이슈 (133줄 그룹 공통)
1. **`<link>` vs `<style>`** — Fixture는 외부 CSS 링크, Snapshot은 인라인 `<style>`. 플랜 기준 **허용 차이**.
2. **출력 포맷** — Fixture는 minified(한 줄), Snapshot은 줄바꿈·들여쓰기. 가독성상 Snapshot 유지 권장.
3. **BOM** — Fixture 일부에 UTF-8 BOM(﻿) 있음. Snapshot은 BOM 없음으로 유지.
4. **meta 오타** — Fixture에 `http_quiv` 오타 있음. Snapshot의 `http-equiv`가 올바름.

### 일괄 수정 범위 vs stem별 개별 수정
- **133줄 그룹:** 본문 구조·클래스·인라인 스타일 값은 이미 fixture와 일치. diff는 위 허용 차이(link/style, 포맷, BOM, meta) 때문이므로 **뷰어 코드 일괄 수정 불필요**. (minify 출력 옵션을 넣지 않는 한 현재 상태로 "의미상 일치"로 간주 가능.)
- **전략:** Phase 2는 **stem별 개별 수정**으로 진행. facename2(112줄)부터 diff가 허용 차이를 넘는 stem만 코드 수정 대상. 133줄 그룹은 별도 코드 변경 없이 다음 stem(footnote-endnote, shaperect 등)부터 진행.
