# 페이지 prefix 배치 실험 기록

## 계약과 미채택 범위

세 실험은 모두 미채택이며 현재 제품에 포함하지 않았다. [그림 대기 중 문단 측정 캐시 보존](resource-geometry-lifetime.md)은 별도 source 계약·브라우저 및 사설 live 증거의 단일 출처다. 이 문서는 그 기능 증거를 복제하지 않고 페이지 실험의 계약·정합성·비용만 소유한다.

검증한 source/prototype·현재 binding·예산 계약은 유지한다. 재사용한 prefix의 위치·입력·소속과 checkpoint가 검증되는 앞부분만 건너뛰고 이후 suffix는 EOF까지 재조판한다. 같은 높이만으로 멈추거나 전체 영향 구간 최소화·suffix 수렴·전체 증분 조판 완료를 선언하지 않는다. 소유·동결 checkpoint의 읽기 최적화도 원본 변이·예산·현재 스타일 계약을 완화할 수 없다.

## 실제 Native 정합성과 활성

세 세대는 각각 새로운 단일 load/edit/undo 및 fresh 대조 strict6쌍에서98rows·40boxes·4pages를 확인했다. undo의 source prefix3은 앞부분 생략 범위이며 suffix는 끝까지 재조판했다. 첫 실험은 그림 자원 수명 정책을 같게 맞춘 비교, 두 번째는 소유 checkpoint 재복사 감소, 세 번째는 전체 membership 검사를 유지하면서 실제 plan 진입까지 owner book 생성을 늦추고 prefix 의존 owner stamp만 만드는 변경이다. 세 번째의 owner3·units1272 감소를 전체 비용 개선으로 해석하지 않는다.

Native 정합성은 제어 glyph 출력·현재 binding과 해당 활성 범위다. 실제 Canvas·전체 문서 픽셀·UI 지연·Native CPU 비용 증거가 아니며 서로 다른 세대의6쌍을 새 시험 합계로 더하지 않는다. 각 Native 원영수증과 실패를 보존한다.

## source 비용과 판정

| 별도 cohort | A/B 중앙값(ms) | 변화 | 순서와 gate | 판정 |
| --- | --- | ---: | --- | --- |
| 최초 page prefix | 3.83075 / 4.3225 | +12.84% | AB·BA 모두 불리, 개선 gate 실패 | 미채택 |
| 소유 checkpoint 재복사 감소 | 4.4921045 / 4.530104 | +0.846% | AB·BA 혼합, 중앙값5% 이상 감소·양 순서 개선 실패 | 미채택 |
| owner book 지연 생성+소유 checkpoint | 3.9185 / 4.229167 | +7.93% | AB·BA 모두 불리, 같은 사전 gate 실패 | 미채택 |

각 cohort는 원40표본을 제외0·재실행0으로 보존했다. 각20회의 출력 strict는 확인했지만 단일 process·순서·GC·출력 보관을 포함한 제어 glyph source 비용이며 독립 사용자 표본이나 실제 UI/Native CPU 시간은 아니다. 비용 구간 밖 Native load/edit/undo를 수행한 사실도 시간 지표의 범위를 바꾸지 않는다.

서로 다른 cohort 사이의 직접 개선율·인과 비교는 하지 않는다. 평균·분산·순서 효과가 있을 수 있으므로 보관량 감소·hit/import 양성·일부 평균 감소만으로 중앙값/양 순서 gate 실패를 덮지 않는다. 세 번째는 source40회 strict·실제 import20을 확인했어도 gate를 통과하지 못했다. 이 기록은 향후 수렴 설계의 승인이나 추가 최적화의 효과를 예고하지 않는다.
