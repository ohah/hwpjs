# 9.2.8 metaTag 요소

`<metaTag>`는 메타 태그에 대한 정보를 가지고 있는 요소이다. json object 형식으로 표현된다.

#### 샘플 10 -- metaTag 예

```xml
<!--fieldBegin 요소의 metaTag-->
<hp:fieldBegin id="1795169102" type="CLICK_HEAR" name="" editable="1" dirty="0"
  zorder="-1" fieldid="627272811">
  <hp:parameters cnt="3" name="">
    <hp:integerParam name="Prop">9</hp:integerParam>
    <hp:stringParam name="Command" xml:space="preserve">
      Clickhere:set:66:Direction:wstring:23:이곳을 마우스로 누르고 내용을 입력하세요.
      HelpState:wstring:0:
    </hp:stringParam>
    <hp:stringParam name="Direction">이곳을 마우스로 누르고 내용을 입력하세요.</hp:stringParam>
  </hp:parameters>
  <hp:metaTag>{"name":"#누름틀"}</hp:metaTag>
</hp:fieldBegin>
```

```xml
<!--tbl 요소의 metaTag-->
<hp:tbl id="1793424928" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM"
  textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL"
  repeatHeader="1" rowCnt="2" colCnt="2" cellSpacing="0" borderFillIDRef="3" noAdjust="0">
  ...
  <hp:tr>
    <hp:tc name="" header="0" hasMargin="0" protect="0" borderFillIDRef="3">
      <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK"
        vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0"
        textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"
        metatag="{&quot;name&quot;:&quot;#이름&quot;}">
        ...
      </hp:subList>
    </hp:tc>
  </hp:tr>
  ...
</hp:tbl>
```

MetaTag의 XSD 타입:

```xml
<xs:complexType name="MetaTagType" mixed="true"/>
```
