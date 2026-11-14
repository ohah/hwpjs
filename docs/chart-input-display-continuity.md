# 차트가 있는 문서의 입력 중 화면 유지

차트 표시 snapshot은 저장·편집 모델이 아니다. 현재 값은 Native 조회 응답에서만 얻으며, 그 응답의 문서·operation revision 검사를 생략하지 않는다.

## 자원 수명

같은 문서·provider·명시 resource epoch의 재표시는 차트 자원을 다시 비우지 않는다. epoch가 바뀌면 현재 값은 즉시 무효화하고 다음 실제 paint에서 조회한다. `StaleSurfaceResource`인 조회만 새 token으로 한 번 더 호출하며, 다른 오류나 두 번째 실패는 화면 진단으로 남긴다. 문서/provider 교체, 종료, 늦은 이전 epoch 응답은 기존 수명 경계를 따른다.

이전 표시 데이터는 현재 Native OLE의 section/wrapper/node, binary item, geometry와 position이 일치할 때만 임시 화면에 사용할 수 있다. 현재 `get().value`는 이때도 null이다. 표시 전용 reader만 provisional 값을 제공하며 편집·저장·정적 출력에는 넘기지 않는다. provisional 표시 중에는 pending coverage를 유지하고 원본 조판 완료로 표시하지 않는다. 삭제되거나 소유권이 모호한 개체는 이 경로를 사용할 수 없다.

## 입력 초안

기존 UTF16 앵커 투영기를 차트 target과 대응 OLE에 함께 적용한다. 입력 초안이라는 이유로 문서 전체 차트를 숨기지 않는다. 초안에서 지운 앵커는 표시 목록에서도 제거한다. Native 원값과 원문은 변경하지 않는다.

## 확인 방법

`node --test tests/hwpx/chart-display-continuity.test.mjs`는 UTF16 이동·삭제, 현재값과 provisional 분리, 프레임/owner 불일치, 단 한 번의 stale 재조회, 예산·ABA·종료 및 재진입을 검사한다. 합성 검사는 실제 브라우저의 입력·페이지 배치·저장 검사를 대신하지 않는다.

## 브라우저 확인 범위

공개 `chart-data-edit.hwpx`에서 기존 화면은 26글자 입력 중 chart count가 1→0으로 바뀌고 measured chart 배치와 fallback 사이에서 행 수가 5↔13으로 바뀌었다. 수정본의 같은 입력과 실행취소·다시 실행 뒤 200글자 입력에서는 chart count 1과 measured chart 배치를 유지했다. 긴 입력의 행 증가는 실제 줄바꿈에 따른 5→6→7이었다. 차트가 있는 문단의 앵커 앞 9글자 입력도 별도로 확인했다.

제품 저장 후 독립 ZIP CRC·XML 검사에서 `Contents/section0.xml`만 변경됐고 `Chart/chart1.xml`과 `BinData/chart1.ole`은 원본과 정확히 같았다. 새 페이지에서 저장본을 열어 차트가 표시됐으며, 기존 데이터 편집 UI로 10→15를 적용한 뒤 다시 열어 현재 값 15도 확인했다. 이 결과는 해당 HWPX 예제와 일반 영문·숫자 입력의 실제 브라우저 검사이며, 모든 차트 종류·모든 문서·OS 한글 조합 입력의 완료 증거는 아니다.
