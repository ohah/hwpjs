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
