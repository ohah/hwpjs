# 캐럿 문단의 글머리표 조회

`CanvasSurface.getHeadingString()`은 Canvas에 배치된 현재 캐럿 문단의 글머리표를 읽습니다. HWP5에서는 문단 모양과 DocInfo의 글머리표 참조를 확인합니다. HWPX에서는 문단 모양과 헤더의 글머리표 ID를 확인합니다. 상태와 문서 이력은 변경되지 않습니다.

문자 글머리표가 확인되면 원본 문자와 출처를 반환합니다. 글머리표가 없다는 원본 정보가 있으면 빈 문자열을 반환합니다. 이미지·체크 글머리표, 불명확한 참조, 범위 선택, 현재 문단을 확인할 수 없는 경우에는 이유가 있는 조회 불가 결과를 반환합니다. 문단 번호와 개요 번호는 실제 조판 번호를 계산하는 지원이 필요합니다.

[한컴 GetHeadingString](https://developer.hancom.com/en-us/webhwp/devguide/hwpctrl/methods/getheadingstring)
