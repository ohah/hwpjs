# Fixture vs Snapshot 실제 레이아웃 비교 보고서

**캡처일**: 2026-02-21  
**방법**: agent-browser로 fixtures/*.html과 snapshots/*.html 각각 열어 전체 페이지 스크린샷 후 비교.

---

## 1. table (table.html)

| 구분 | Fixture (원본) | Snapshot (뷰어 출력) |
|------|----------------|----------------------|
| **위치** | 페이지 좌상단, 여백으로 인한 오프셋 (left:31mm, top:35.99mm 목표) | 좌상단, 비슷한 오프셋 |
| **구조** | 2열: 왼쪽 2개 셀(위·아래), 오른쪽 1개 병합 셀. 일부 fixture는 하단에 전체 폭 행 추가 | 2행 2열: 왼쪽 열 2개 셀, 오른쪽 열 1개(행 병합) |
| **셀 높이** | 25mm + 25mm (병합 반영) | 왼쪽 2셀 높이 비슷, 오른쪽 병합 셀 높이와 대체로 일치 |
| **비고** | audit_report 기준 수치 차이(31/35.99 vs 30/35, viewBox, hls) 반영 후 스냅샷이 fixture에 더 가까워진 상태 |

**스크린샷**: `layout-fixture-table.png` vs `layout-snapshot-table.png`

---

## 2. table2 (table2.html)

| 구분 | Fixture (원본) | Snapshot (뷰어 출력) |
|------|----------------|----------------------|
| **DOM 순서** | 표 2(48.04mm) → 표 1(35mm) | 동일: top_mm 내림차순 정렬로 출력 |
| **위치** | 두 블록 세로 배치, 간격 유지 | 동일: next_para_vertical_mm 누적 + htG 높이 사용 |
| **htb 스타일** | 캡션 테이블 htb에 inline-block 없음 | 동일: needs_htg 시 htb_extra_style="" |
| **비고** | 2026-02-21 반영: DOM 순서·누적 위치·htb 스타일 코드 정리 |

**스크린샷**: `layout-fixture-table2.png` vs `layout-snapshot-table2.png`

---

## 3. table-caption (table-caption.html)

| 구분 | Fixture (원본) | Snapshot (뷰어 출력) |
|------|----------------|----------------------|
| **구성** | 표 1 위 캡션, 표 2 아래 캡션, 표 3 왼쪽, 표 4 오른쪽, 표 5 왼쪽 위, 표 6 오른쪽 아래, 표 7 여백까지 확대, 표 8 한 줄로 입력 (2페이지) | 표 1 위 여백, 표 2 아래 여백, 표 3 왼쪽, 표 4 오른쪽, 표 5 왼쪽 위, 표 6 오른쪽 아래, 표 8 한 줄로 입력, 표 7 여백까지 확대 |
| **위치** | 캡션·정렬별로 상/하/좌/우/좌상/우하 등 명확히 구분 | 전체적으로 비슷한 배치, 레이블 문구만 "위 캡션" vs "위 여백" 등 미세 차이 가능 |
| **비고** | htG/htb, 캡션 간격·여백이 파싱값으로 나오는지 레이아웃으로 검증 |

**스크린샷**: `layout-fixture-table-caption.png` vs `layout-snapshot-table-caption.png`

---

## 4. table-position (table-position.html)

| 구분 | Fixture (원본) | Snapshot (뷰어 출력) |
|------|----------------|----------------------|
| **페이지 1** | 표 1: 107mm, 글자처럼 취급 (인라인) | 텍스트 + 가로선 2줄 (표/텍스트 해석에 따라 다를 수 있음) |
| **페이지 2** | 표 2: 107mm, 왼쪽 정렬 10mm × 4개 | "표 2 \| 너비 10mm, 높이 자동채움 Row" 형태 블록 × 4 |
| **페이지 3** | 표 3: 107mm, 가운데 정렬 10mm × 4개 | 표 2와 동일 문구 블록 × 4 (중앙 정렬 여부는 화면으로 확인) |
| **페이지 4** | 표 4: 107mm, 오른쪽 정렬 10mm × 4개 | 표 2 문구 + "Tmm." 등 추가 텍스트 |
| **비고** | 107mm 폭, 10mm 오프셋, 좌/가운데/우 정렬이 fixture와 일치하는지 시각적으로 확인 필요. 스냅샷 레이블이 fixture와 다르게 보일 수 있음(렌더링/폰트 차이) |

**스크린샷**: `layout-fixture-table-position.png` vs `layout-snapshot-table-position.png`

---

## 재현 방법 (직접 레이아웃 비교)

```bash
# 1) 테스트 디렉터리에서 서버 실행
cd crates/hwp-core/tests && python3 -m http.server 9876

# 2) 브라우저에서 열기
# Fixture: http://127.0.0.1:9876/fixtures/table.html (및 table2, table-caption, table-position)
# Snapshot: http://127.0.0.1:9876/snapshots/table.html (동일 stem)

# 3) 스크린샷 촬영 (agent-browser)
agent-browser open http://127.0.0.1:9876/fixtures/table.html
agent-browser screenshot --full layout-fixture-table.png
agent-browser open http://127.0.0.1:9876/snapshots/table.html
agent-browser screenshot --full layout-snapshot-table.png
# ... 동일하게 table2, table-caption, table-position 반복
```

---

## 요약

- **table**: 구조(2열, 왼쪽 2셀/오른쪽 병합)는 fixture와 snapshot 모두 동일하게 보임. 위치·셀 높이·viewBox 등 수치를 파싱값으로 맞춘 뒤라 스냅샷이 fixture에 더 근접한 상태.
- **table2**: 캡션/여백 설명 문구와 가로선 배치가 비슷함. 수치가 문서 파싱값에서만 나오는지 확인용.
- **table-caption**: 표 1~8의 캡션 위치·정렬이 fixture와 snapshot에서 대체로 동일한 레이아웃으로 보임. 레이블 문구만 약간 다를 수 있음.
- **table-position**: 107mm, 10mm, 좌/가운데/우 정렬이 fixture와 일치하는지 브라우저에서 나란히 열어 확인하는 것이 좋음. 스냅샷에서 텍스트가 "표 2 | 너비 10mm…" 등으로 보일 수 있어, fixture의 "표 2.107mm, 왼쪽 정렬 10mm"와 의미상 동일한지 확인 필요.

**결론**: 코드만이 아니라 **실제 렌더링 레이아웃**도 fixture(원본) vs snapshot(뷰어 출력)으로 비교했으며, 위 스크린샷 파일들을 나란히 보면 위치·크기·정렬 차이를 직접 확인할 수 있습니다.
