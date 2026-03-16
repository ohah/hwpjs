# 9.2.5 compatibleDocument 요소

#### 9.2.5.1 compatibleDocument

`<compatibleDocument>` 요소는 이 표준에서 정의하고 있는 문서 형식을 다른 형태의 문서 형식으로 저장할 때 사용되는 정보를 가지고 있는 요소이다.

#### 표 16 -- compatibleDocument 속성

| 속성 이름 | 설명 |
|-----------|------|
| targetProgram | 대상 프로그램 |

| 하위 요소 이름 | 설명 |
|---------------|------|
| layoutCompatibility | 레이아웃 호환성 설정 |

#### 샘플 8 -- compatibleDocument 예

```xml
<hh:compatibleDocument targetProgram="HWP201X">
  <hh:layoutCompatibility/>
</hh:compatibleDocument>
```

#### 9.2.5.2 layoutCompatibility 요소

`<layoutCompatibility>` 요소는 HWP 문서를 다른 형식의 문서로 변환시킬 때 필요한 설정 정보이다. 즉, HWP 문서를 OOXML 워드 문서 또는 ODF 워드 문서로 변환시킬 경우, HWP 문서에서는 지원되지만 OOXML/ODF에서 지원되지 않는 레이아웃 설정 등을 어떤 방식으로 변환시킬 것인지에 대한 설정이다. 하위 요소가 나타나는 경우에는 그 값이 사용되는 경우이고, 나타나지 않는 경우는 사용되지 않는 경우이다.

#### 표 17 -- layoutCompatibility 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| applyFontWeightToBold | 진하게 글자에 글꼴의 너비를 적용함 |
| useInnerUnderline | 밑줄 위치를 줄 영역의 안쪽으로 그음 |
| fixedUnderlineWidth | 밑줄, 취소선 두께에 글자 크기를 반영하지 않음 |
| doNotApplyStrikeoutWithUnderline | 밑줄과 함께 설정된 취소선을 적용하지 않음 |
| useLowercaseStrikeout | 취소선을 영문 소문자 기준으로 그음 |
| extendLineheightToOffset | 글자 위치와 강조점에 의한 영역까지 줄 높이를 확장함 |
| applyFontspaceToLatin | 라틴어 사이의 빈칸에 글꼴에 어울리는 빈칸을 적용함 |
| treatQuotationAsLatin | 인용 부호를 글꼴에 어울리는 빈칸에서 라틴어로 취급함 |
| doNotApplyDiacSymMarkOfNoneAndSix | 강조점의 [없음]과 6개 외의 항목을 적용하지 않음 |
| doNotAlignWhitespaceOnRight | 줄의 가장 오른쪽 빈칸을 다음 줄로 넘기지 않음 |
| doNotAdjustWordInJustify | 양쪽 정렬에서 단어의 문자간 간격을 보정하지 않음 |
| baseCharUnitOnEAsian | 글자 단위를 바탕글 스타일의 한글 크기를 기준으로 적용함 |
| baseCharUnitOfIndentOnFirstChar | 들여쓰기/내어쓰기의 글자 단위를 문단 첫 글자의 크기를 기준으로 적용함 |
| adjustLineheightToFont | 기본 줄 높이를 글꼴에 맞춰서 조정함 |
| adjustBaselineInFixedLinespacing | 줄 간격의 [고정값]에서 기준선을 세로 정렬에 따라 조정함 |
| applyPrevspacingBeneathObject | 개체 아래 문단의 위 간격을 개체 기준으로 적용함 |
| applyNextspacingOfLastPara | 마지막 문단의 아래 간격을 영역에 포함하여 확장함 |
| applyAtLeastToPercent100Pct | 줄 간격의 [최소]를 [글자에 따라]에서 100%로 적용함 |
| doNotApplyAutoSpaceEAsianEng | 한글과 영어 간격에 자동 조절을 적용하지 않음 |
| doNotApplyAutoSpaceEAsianNum | 한글과 숫자 간격에 자동 조절을 적용하지 않음 |
| adjustParaBorderfillToSpacing | 문단 테두리/배경의 영역을 문단 여백과 위, 아래 간격을 제외하고 줄 간격에만 적용함 |
| connectParaBorderfillOfEqualBorder | 문단 테두리가 같은 문단의 문단 테두리/배경을 연결함 |
| adjustParaBorderOffsetWithBorder | 문단 테두리/배경의 간격을 테두리 설정 시에 적용함 |
| extendLineheightToParaBorderOffset | 문단 테두리의 굵기와 간격의 영역까지 줄 높이를 확장함 |
| applyParaBorderToOutside | 문단 테두리를 지정된 영역의 바깥쪽으로 적용함 |
| applyMinColumnWidthTo1mm | 단 영역의 최소 폭을 1 mm로 적용함 |
| applyTabPosBasedOnSegment | 탭 위치를 개체에 의해 배치된 영역을 기준으로 적용함 |
| breakTabOverLine | 줄 영역을 넘어선 탭을 다음 줄로 넘김 |
| adjustVertPosOfLine | 줄 간격에 따라 줄의 위치를 조정함 |
| doNotApplyWhiteSpaceHeight | white space 문자의 글자 크기를 줄 높이에 반영하지 않음 |
| doNotAlignLastPeriod | 줄의 마지막 마침표를 다음 줄로 넘기지 않음 |
| doNotAlignLastForbidden | 줄의 마지막 금칙 문자를 다음 줄로 넘기지 않음 |
| baseLineSpacingOnLineGrid | 줄 격자의 간격을 줄 간격의 기준으로 적용함 |
| applyCharSpacingToCharGrid | 글자 격자의 간격을 글자에 따른 자간으로 적용함 |
| doNotApplyGridInHeaderFooter | 머리말, 꼬리말에 줄/글자 격자를 적용하지 않음 |
| applyExtendHeaderFooterEachSection | 본문 영역으로 확장되는 구역 단위 머리말, 꼬리말을 적용함 |
| doNotApplyHeaderFooterAtNoSpace | 머리말, 꼬리말 영역이 없을 때에는 머리말, 꼬리말을 적용하지 않음 |
| doNotApplyColSeparatorAtNoGap | 단 사이의 간격이 없을 때에는 단 구분선을 적용하지 않음 |
| doNotApplyLinegridAtNoLinespacing | 줄 간격이 없으면 줄 격자의 간격을 적용하지 않음 |
| doNotApplyImageEffect | 그림 효과를 적용하지 않음 |
| doNotApplyShapeComment | 개체 설명문 적용하지 않음 |
| doNotAdjustEmptyAnchorLine | 조판 부호만 있는 빈 줄에 개체 배치를 조정하지 않음 |
| overlapBothAllowOverlap | 개체 두 개가 서로 겹침 허용인 경우에만 서로 겹침 |
| doNotApplyVertOffsetOfForward | 조판 부호 다음 쪽으로 넘겨진 개체에 세로 위치를 적용하지 않음 |
| extendVertLimitToPageMargins | 문단 기준 개체의 세로 위치를 종이 영역까지 확장함 |
| doNotHoldAnchorOfTable | 문단 기준 표의 조판 부호는 쪽 넘김을 방지하지 않음 |
| doNotFormattingAtBeneathAnchor | 문단과 조판 부호 다음 쪽으로 넘겨진 개체 사이 영역에 문단을 배치하지 않음 |
| adjustBaselineOfObjectToBottom | 글자처럼 취급한 개체의 기준선을 개체 아래쪽으로 조정함 |
| doNotApplyExtensionCharcharPr | 글자 겹치기의 확장 기능을 적용하지 않음 |
