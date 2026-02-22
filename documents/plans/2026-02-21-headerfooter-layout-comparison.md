# 머리말/꼬리말(headerfooter) Fixture vs Snapshot 레이아웃 비교

**일시:** 2026-02-21  
**도구:** agent-browser로 두 HTML 열어 스냅샷·전체 스크린샷 촬영 후 비교

---

## 1. 비교 대상

| 구분 | 경로 | URL (로컬 서버 9876) |
|------|------|----------------------|
| **Fixture (골든)** | `crates/hwp-core/tests/fixtures/headerfooter.HTML` | http://127.0.0.1:9876/fixtures/headerfooter.HTML |
| **Snapshot (뷰어 출력)** | `crates/hwp-core/tests/snapshots/headerfooter.html` | http://127.0.0.1:9876/snapshots/headerfooter.html |

**스크린샷 (agent-browser `screenshot --full`):**
- Fixture: `crates/hwp-core/tests/snapshots/compare-headerfooter-fixture.png`
- Snapshot: `crates/hwp-core/tests/snapshots/compare-headerfooter-snapshot.png`

---

## 2. HTML 구조 차이

### 2.1 Fixture (골든)

- **단일 페이지 컨테이너:** `div.hpa` (210mm×297mm) **한 개** 안에 머리말·꼬리말·본문이 모두 포함.
- **위치 방식:** 절대 위치 `hcD`로 같은 hpa 안에서 배치.
  - 머리말: `hcD` `left:30mm; top:20mm`
  - 꼬리말: `hcD` `left:30mm; top:267mm`
  - 본문: `hcD` `left:30mm; top:35mm`
- **머리말 내용:** "Header 이것은 머리말입니다" + **쪽 번호 "1."** (`haN` div 포함).
- **스타일:** `line-height:2.48mm`, `top:-0.16mm`, 외부 CSS `headerfooter_style.css`.

### 2.2 Snapshot (현재 뷰어 출력)

- **블록 순서:** `body` 직하위에 **세 개의 형제 블록**.
  1. `div.ohah-hwpjs-header` — 머리말
  2. `div.hpa` — 본문 페이지만 (210×297mm)
  3. `div.ohah-hwpjs-footer` — 꼬리말
- **위치 방식:** 머리말/꼬리말이 **문서 흐름(block)**으로 본문 위/아래에 붙음. 같은 페이지(hpa) 안에 있지 않음.
- **머리말 내용:** "Header 이것은 머리말입니다.**.**" (마침표만), **쪽 번호 "1." 없음**.
- **스타일:** 인라인 `<style>`, `line-height:3.18mm`, `top:0.00mm`.

---

## 3. 레이아웃 차이 요약

| 항목 | Fixture | Snapshot | 동일 여부 |
|------|---------|----------|-----------|
| **머리말/꼬리말 배치** | 한 페이지(hpa) 내부, `top:20mm` / `top:267mm` 절대 위치 | body 상단/하단 블록, hpa 밖 | ❌ 다름 |
| **페이지 구조** | 1개 hpa에 머리말+본문+꼬리말 | 1개 hpa(본문만) + header/footer 블록 | ❌ 다름 |
| **머리말 쪽 번호** | "1." 포함 (haN) | 없음 | ❌ 다름 |
| **꼬리말 문구** | "Footer 이것은 꼬리말입니다." | 동일 | ✅ 동일 |
| **본문** | "첫 페이지" | 동일 | ✅ 동일 |
| **line-height 등** | 2.48mm, -0.16mm | 3.18mm, 0.00mm | ❌ 수치 다름 |

---

## 4. 결론

- **실제 HTML 레이아웃은 다릅니다.**
  - Fixture: 머리말/꼬리말이 **페이지(hpa) 안에서** 절대 위치로 “용지 상단 20mm, 하단 267mm”에 고정.
  - Snapshot: 머리말/꼬리말이 **본문 페이지와 별도 블록**으로 body 위/아래에 흐름 배치.
- **추가 차이:** Fixture에는 머리말 쪽 번호 "1."이 있으나, Snapshot에는 미구현.  
  (스펙 4.3.10.3 머리말/꼬리말·문단 리스트 기준으로 쪽 번호 반영은 별도 작업 대상.)

---

## 5. 재현 방법

```bash
# 테스트 디렉터리에서 HTTP 서버 기동
cd crates/hwp-core/tests && python3 -m http.server 9876

# agent-browser로 비교
agent-browser open http://127.0.0.1:9876/fixtures/headerfooter.HTML
agent-browser screenshot --full compare-headerfooter-fixture.png

agent-browser open http://127.0.0.1:9876/snapshots/headerfooter.html
agent-browser screenshot --full compare-headerfooter-snapshot.png
```

이미 생성된 스크린샷은 `snapshots/compare-headerfooter-fixture.png`, `compare-headerfooter-snapshot.png` 에 저장되어 있음.
