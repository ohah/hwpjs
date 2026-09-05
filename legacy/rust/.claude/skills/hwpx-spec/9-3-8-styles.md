# 9.3.9 styles 요소

#### 9.3.9.1 styles

스타일 정보 목록을 가지고 있는 요소이다.

#### 표 83 -- styles 요소

| 속성 이름 | 설명 |
|-----------|------|
| itemCnt | 스타일 정보의 개수 |

#### 표 84 -- styles 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| style | 스타일 정보 |

#### 샘플 42 -- styles 예

```xml
<hh:styles itemCnt="21">
  <hh:style id="0" type="PARA" name="바탕글" engName="Normal"
    paraPrIDRef="0" charPrIDRef="6" nextStyleIDRef="0" langID="1042" lockForm="0"/>
  <hh:style id="1" type="PARA" name="본문" engName="Body"
    paraPrIDRef="1" charPrIDRef="6" nextStyleIDRef="1" langID="1042" lockForm="0"/>
  <hh:style id="2" type="PARA" name="개요 1" engName="Outline 1"
    paraPrIDRef="2" charPrIDRef="6" nextStyleIDRef="2" langID="1042" lockForm="0"/>
  <hh:style id="3" type="PARA" name="개요 2" engName="Outline 2"
    paraPrIDRef="3" charPrIDRef="6" nextStyleIDRef="3" langID="1042" lockForm="0"/>
  <!-- ... id 4~11: 개요 3~10 ... -->
  <hh:style id="12" type="CHAR" name="쪽 번호" engName="Page Number"
    paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/>
  <hh:style id="13" type="PARA" name="머리말" engName="Header"
    paraPrIDRef="9" charPrIDRef="1" nextStyleIDRef="13" langID="1042" lockForm="0"/>
  <hh:style id="14" type="PARA" name="각주" engName="Footnote"
    paraPrIDRef="10" charPrIDRef="2" nextStyleIDRef="14" langID="1042" lockForm="0"/>
  <hh:style id="15" type="PARA" name="미주" engName="Endnote"
    paraPrIDRef="10" charPrIDRef="2" nextStyleIDRef="15" langID="1042" lockForm="0"/>
  <hh:style id="16" type="PARA" name="메모" engName="Memo"
    paraPrIDRef="11" charPrIDRef="3" nextStyleIDRef="16" langID="1042" lockForm="0"/>
  <hh:style id="17" type="PARA" name="차례 제목" engName="TOC Heading"
    paraPrIDRef="12" charPrIDRef="4" nextStyleIDRef="17" langID="1042" lockForm="0"/>
  <hh:style id="18" type="PARA" name="차례 1" engName="TOC 1"
    paraPrIDRef="13" charPrIDRef="5" nextStyleIDRef="18" langID="1042" lockForm="0"/>
  <hh:style id="19" type="PARA" name="차례 2" engName="TOC 2"
    paraPrIDRef="14" charPrIDRef="5" nextStyleIDRef="19" langID="1042" lockForm="0"/>
  <hh:style id="20" type="PARA" name="차례 3" engName="TOC 3"
    paraPrIDRef="15" charPrIDRef="5" nextStyleIDRef="20" langID="1042" lockForm="0"/>
</hh:styles>
```

#### 9.3.9.2 style 요소

스타일은 자주 사용하는 글자 모양이나 문단 모양을 미리 정해 놓고서 이를 사용할 수 있게 해주는 기능이다. `<style>` 요소는 설정된 스타일 기능을 표현하기 위한 요소이다.

#### 표 85 -- style 요소

| 속성 이름 | 설명 |
|-----------|------|
| id | 스타일 정보를 구별하기 위한 아이디 |
| type | 스타일 종류: `PARA` (문단 스타일), `CHAR` (글자 스타일) |
| name | 스타일의 로컬 이름. 한글 윈도에서는 한글 스타일 이름 |
| engName | 스타일의 영문 이름 |
| paraPrIDRef | 문단 모양 아이디 참조값. 스타일의 종류가 문단인 경우 반드시 지정해야 함 |
| charPrIDRef | 글자 모양 아이디 참조값. 스타일의 종류가 글자인 경우 반드시 지정해야 함 |
| nextStyleIDRef | 다음 스타일 아이디 참조값. 문단 스타일에서 사용자가 리턴 키를 입력하여 다음 문단으로 이동하였을 때 적용될 문단 스타일을 지정함 |
| langID | 언어 아이디. `http://www.w3.org/WAI/ER/IG/ert/iso639.htm` 참조 |
| lockForm | 양식 모드에서 style 보호하기 여부 |
