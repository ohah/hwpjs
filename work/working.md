# 서식문제  
BodyText의 HWPTAG_PARA_LINE_SEG, 그리고 Docinfo의 HWPTAG_PARA_SHAPE는 텍스트, 또는 객체의 서식 위치에 관여함.

> HWPTAG_PARA_LINE_SEG
공식 문서에서는 HWPTAG_PARA_LINE_SEG는 36사이즈라고 되어있으나 실질적으로 해당 객체, 또는 텍스트의 위치의 좌표가 여러개를 표시해야 하는경우 그만큼 추가가 됨 (36 x n)  
TEXT의 개행 문제로 예를 들면, 개행문자(엔터)등으로 인한 강제적 개행이 아닌 줄바꿈으로 인한 개행의 경우 개행이 된 해당 텍스트의 좌표가 기록된다.  
그리고 위치와 넓이 크기가 다 기록됨.
처음 hwpjs를 제작할시에는 이 좌표로 기록하면 되겠다 싶어, html의 레이아웃에 맞게 계산(hwpInch)하여 처리했으나 제대로 레이아웃이 나오지 않아, 보류했었음.

> HWPTAG_CHAR_SHAPE
BodyText의 HWPTAG_CHAR_SHAPE에서 등록된 서식만큼 텍스트 시작위치와 DocInfo의 PARA_SHAPE 아이디 값을 가져 오게 됨
명확하게 기록된 부분은 HWPTAG_CHAR_SHAPE여서 해당 부분부터 먼저 처리하였고, 텍스트 시작위치를 받아 span으로 처리하였고 line-height, 들여쓰기 등의 위치값을 받아 처리 하였으나 
글씨크기, 굵기 정도의 서식은 어느정도 유사한 결과를 나타냈으나 그 외의 서식 등은 눈에 띄게 한글 문서와 동일한 레이아웃이 나오지 않음.
특히 위에서 HWPTAG_PARA_LINE_SEG에서 언급한 줄바꿈 개행의 문자 위치가 다른 경우가 매우 흔했음.

## 소결 

다만  HWPTAG_PARA_LINE_SEG이 분석이 제대로 끝났고. 어떤형식으로 이루어져있는지 알았기 때문에 페이지 용치에 relative 속성을 넣고 요소요소들을 절대(absolute) 속성으로 넣어도 더 이상 겹치는 문제는 
없을듯 하다.

다만 기존의 css처리의 구조형태를 상당히 뒤집어야 하고, 위에서 말한 CHAR_SHAPE와 LINE_SEG의 서식이 겹치는 부분이 있어 span 태그로 감싼 CHAR_SHAPE처리에 문제가 있다.
