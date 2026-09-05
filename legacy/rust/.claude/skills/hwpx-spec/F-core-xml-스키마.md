# 부속서 F (규정) Core XML 스키마

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:hc="http://www.owpml.org/owpml/2024/core"
targetNamespace="http://www.owpml.org/owpml/2024/core" elementFormDefault="qualified">
<xs:simpleType name="NumberType1">
<xs:restriction base="xs:string">
<xs:enumeration value="DIGIT">
<xs:annotation>
<xs:documentation>1, 2, 3</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CIRCLED_DIGIT">
<xs:annotation>
<xs:documentation>동그라미 쳐진 1, 2, 3</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value=
<xs:annotation>
<xs:documentS
"ROM
AN_CAPITAL">
ation>I, II, III</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="ROMAN_SMALL">
<xs:annotation>
<xs:documentation>i, ii, iii</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="LATIN_CAPITAL">
<xs:annotation>
<xs:documentation>A, B, C</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="LATIN_SMALL">
<xs:annotation>
<xs:documentation>a, b, c</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CIRCLED_LATIN_CAPITAL">
<xs:annotation>
<xs:documentation>동그라미 쳐진 A, B, C</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CIRCLED_LATIN_SMALL">

<xs:annotation>
<xs:documentation>동그라미 쳐진 a, b, c</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="HANGUL_SYLLABLE">
<xs:annotation>
<xs:documentation>가, 나, 다</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CIRCLED_HANGUL_SYLLABLE">
<xs:annotation>
<xs:documentation>동그라미 쳐진 가, 나, 다</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="HANGUL_JAMO">
<xs:annotation>
<xs:documentation>ㄱ, ㄴ, ㄷ</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CIRCLED_HANGUL_JAMO">
<xs:annotation>
<xs:documentation>동그라미 쳐진 ㄱ, ㄴ, ㄷ</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value=S
"HANG-
UL_PHM
ONETIC">
<xs:annotation>
<xs:documentation>일, 이, 삼</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="IDEOGRAPH">
<xs:annotation>
<xs:documentation>一, 二, 三</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CIRCLED_IDEOGRAPH">
<xs:annotation>
<xs:documentation>동그라미 쳐진 一, 二, 三</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
<xs:simpleType name="NumberType2">
<xs:restriction base="xs:string">
<xs:enumeration value="DIGIT">
<xs:annotation>
<xs:documentation>1, 2, 3</xs:documentation>
</xs:annotation>
</xs:enumeration>

<xs:enumeration value="CIRCLED_DIGIT">
<xs:annotation>
<xs:documentation>동그라미 쳐진 1, 2, 3</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="ROMAN_CAPITAL">
<xs:annotation>
<xs:documentation>I, II, III</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="ROMAN_SMALL">
<xs:annotation>
<xs:documentation>i, ii, iii</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="LATIN_CAPITAL">
<xs:annotation>
<xs:documentation>A, B, C</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="LATIN_SMALL">
<xs:annotation>
</x
</xs:en
<xs:enumeration value=<xs:do
cumentation>a, b, c</xs:documentation>
s:annotation>
umeration>
meration value=S"CIRC-LED_LATIN_CAPITAL">
<xs:annotation>
<xs:documentation>동그라미 쳐진 A, B, C</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CIRCLED_LATIN_SMALL">
<xs:annotation>
<xs:documentation>동그라미 쳐진 a, b, c</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="HANGUL_SYLLABLE">
<xs:annotation>
<xs:documentation>가, 나, 다</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CIRCLED_HANGUL_SYLLABLE">
<xs:annotation>
<xs:documentation>동그라미 쳐진 가, 나, 다</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="HANGUL_JAMO">
<xs:annotation>
<xs:documentation>ㄱ, ㄴ, ㄷ</xs:documentation>

</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CIRCLED_HANGUL_JAMO">
<xs:annotation>
<xs:documentation>동그라미 쳐진 ㄱ, ㄴ, ㄷ</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="HANGUL_PHONETIC">
<xs:annotation>
<xs:documentation>일, 이, 삼</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="IDEOGRAPH">
<xs:annotation>
<xs:documentation>一, 二, 三</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CIRCLED_IDEOGRAPH">
<xs:annotation>
<xs:documentation>동그라미 쳐진 一, 二, 三</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value=
<xs:annotation>
<xs:documentS
"DECA
GON_CIRCLE">
ation>갑, 을,
병, 정, 무,
기, 경, 신T
, 임, 계</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DECAGON_CIRCLE_HANJA">
<xs:annotation>
<xs:documentation>甲, 乙, 丙, 丁, 戊, 己, 庚, 辛, 壬, 癸</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="SYMBOL">
<xs:annotation>
<xs:documentation>4가지 문자가 차례로 반복</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="USER_CHAR">
<xs:annotation>
<xs:documentation>사용자 지정 문자 반복</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
<xs:simpleType name="LineType1">
<xs:restriction base="xs:string">
<xs:enumeration value="NONE">
<xs:annotation>

<xs:documentation>없음</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="SOLID">
<xs:annotation>
<xs:documentation>실선</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DOT">
<xs:annotation>
<xs:documentation>점선</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="THICK">
<xs:annotation>
<xs:documentation>두꺼운 선</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DASH">
<xs:annotation>
<xs:documentation>긴 점선</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration
meration value="DASH_DOT">
s:annotaT
tion>
<xs:documentation>--.-.-.</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DASH_DOT_DOT">
<xs:annotation>
<xs:documentation>-..-..-..</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
<xs:simpleType name="LineType2">
<xs:restriction base="xs:string">
<xs:enumeration value="NONE">
<xs:annotation>
<xs:documentation>선없음</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="SOLID">
<xs:annotation>
<xs:documentation>실선</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DOT">

<xs:annotation>
<xs:documentation>점선</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DASH">
<xs:annotation>
<xs:documentation>긴 점선</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DASH_DOT">
<xs:annotation>
<xs:documentation>-.-.-.</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DASH_DOT_DOT">
<xs:annotation>
<xs:documentation>-..-..-..</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="LONG_DASH">
<xs:annotation>
<xs:documentation>DASH보다 긴 선의 반복</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value=S
"CIRC-
LE">
<xs:annotation>
<xs:documentation>DOT보다 큰 동그라미의 반복</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DOUBLE_SLIM">
<xs:annotation>
<xs:documentation>2중선(가는 선+ 가는 선)</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="SLIM_THICK">
<xs:annotation>
<xs:documentation>2중선(가는 선+ 굵은 선)</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="THICK_SLIM">
<xs:annotation>
<xs:documentation>2중선(굵은 선+ 가는 선)</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="SLIM_THICK_SLIM">
<xs:annotation>
<xs:documentation>3중선(가는 선+ 굵은 선+ 가는 선)</xs:documentation>
</xs:annotation>

</xs:enumeration>
</xs:restriction>
</xs:simpleType>
<xs:simpleType name="LineType3">
<xs:restriction base="xs:string">
<xs:enumeration value="NONE">
<xs:annotation>
<xs:documentation>선없음</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="SOLID">
<xs:annotation>
<xs:documentation>실선</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DOT">
<xs:annotation>
<xs:documentation>점선</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DASH">
<xs:annotation>
<xs:documentation>긴 점선</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DASH_DOT">
<xs:annotation>
<xs:documentation>-.-.-.</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DASH_DOT_DOT">
<xs:annotation>
<xs:documentation>-..-..-..</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="LONG_DASH">
<xs:annotation>
<xs:documentation>DASH보다 긴 선의 반복</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CIRCLE">
<xs:annotation>
<xs:documentation>DOT보다 큰 동그라미의 반복</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DOUBLE_SLIM">
<xs:annotation>
<xs:documentation>2중선(가는 선+ 가는 선)</xs:documentation>

</xs:annotation>
</xs:enumeration>
<xs:enumeration value="SLIM_THICK">
<xs:annotation>
<xs:documentation>2중선(가는 선+ 굵은 선)</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="THICK_SLIM">
<xs:annotation>
<xs:documentation>2중선(굵은 선+ 가는 선)</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="SLIM_THICK_SLIM">
<xs:annotation>
<xs:documentation>3중선(가는 선+ 굵은 선+ 가는 선)</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="WAVE"/>
<xs:enumeration value="DOUBLEWAVE"/>
</xs:restriction>
</xs:simpleType>
<xs:simpleType name="LineWidth">
<xs
:restrictio
<xs:whi
<xs:enu
<xs:enumeration value=n base="xs:string">
teSpace value="collapse"/>
merationT
 value=S
"0.1 mm"/>
meration value="0.12 mm"/>
<xs:enumeration value="0.15 mm"/>
<xs:enumeration value="0.2 mm"/>
<xs:enumeration value="0.25 mm"/>
<xs:enumeration value="0.3 mm"/>
<xs:enumeration value="0.4 mm"/>
<xs:enumeration value="0.5 mm"/>
<xs:enumeration value="0.6 mm"/>
<xs:enumeration value="0.7 mm"/>
<xs:enumeration value="1.0 mm"/>
<xs:enumeration value="1.5 mm"/>
<xs:enumeration value="2.0 mm"/>
<xs:enumeration value="3.0 mm"/>
<xs:enumeration value="4.0 mm"/>
<xs:enumeration value="5.0 mm"/>
</xs:restriction>
</xs:simpleType>
<xs:simpleType name="RGBColorType">
<xs:restriction base="xs:string">
<xs:pattern value="#[0-9A-Fa-f]{6}"/>
</xs:restriction>
</xs:simpleType>
<xs:simpleType name="AlignStyleType">

<xs:restriction base="xs:string">
<xs:enumeration value="TOP_LEFT"/>
<xs:enumeration value="TOP"/>
<xs:enumeration value="TOP_RIGHT"/>
<xs:enumeration value="LEFT"/>
<xs:enumeration value="CENTER"/>
<xs:enumeration value="RIGHT"/>
<xs:enumeration value="BOTTOM_LEFT"/>
<xs:enumeration value="BOTTOM"/>
<xs:enumeration value="BOTTOM_RIGHT"/>
</xs:restriction>
</xs:simpleType>
<xs:simpleType name="ArrowType">
<xs:restriction base="xs:string">
<xs:enumeration value="NORMAL"/>
<xs:enumeration value="ARROW"/>
<xs:enumeration value="SPEAR"/>
<xs:enumeration value="CONCAVE_ARROW"/>
<xs:enumeration value="EMPTY_DIAMOND"/>
<xs:enumeration value="EMPTY_CIRCLE"/>
<xs:enumeration value="EMPTY_BOX"/>
<xs:enumeration value="FILLED_DIAMOND"/>
<xs:enumeration value=
<xs:enumeration value=S
"FILLED_CIRCLE"/>
"FILLE-
D_BOX"/>
</xs:restriction>
</xs:simpleType>
<xs:simpleType name="ArrowSize">
<xs:restriction base="xs:string">
<xs:enumeration value="SMALL_SMALL"/>
<xs:enumeration value="SMALL_MEDIUM"/>
<xs:enumeration value="SMALL_LARGE"/>
<xs:enumeration value="MEDIUM_SMALL"/>
<xs:enumeration value="MEDIUM_MEDIUM"/>
<xs:enumeration value="MEDIUM_LARGE"/>
<xs:enumeration value="LARGE_SMALL"/>
<xs:enumeration value="LARGE_MEDIUM"/>
<xs:enumeration value="LARGE_LARGE"/>
</xs:restriction>
</xs:simpleType>
<xs:simpleType name="TrackChangeType">
<xs:restriction base="xs:string">
<xs:enumeration value="UnKown"/>
<xs:enumeration value="Insert"/>
<xs:enumeration value="Delete"/>
<xs:enumeration value="CharShape"/>
<xs:enumeration value="ParaShape"/>
</xs:restriction>
</xs:simpleType>

<xs:simpleType name="DropCapStyleType">
<xs:restriction base="xs:string">
<xs:enumeration value="None"/>
<xs:enumeration value="DoubleLine"/>
<xs:enumeration value="TripleLine"/>
<xs:enumeration value="Margin"/>
</xs:restriction>
</xs:simpleType>
<xs:attributeGroup name="MarginAttributeGroup">
<xs:annotation>
<xs:documentation>여백 정보</xs:documentation>
</xs:annotation>
<xs:attribute name="left" type="xs:nonNegativeInteger" use="required">
<xs:annotation>
<xs:documentation>왼쪽 여백. 단위는 HWPUNIT.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="right" type="xs:nonNegativeInteger" use="required">
<xs:annotation>
<xs:documentation>오른쪽 여백. 단위는 HWPUNIT.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="t
op" type
="xs:n
onNega
tiveInteger"
use="requ
ired">
<xs:annotation>
<xs:documentation>위 여백. 단위는 HWPUNIT.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="bottom" type="xs:nonNegativeInteger" use="required">
<xs:annotation>
<xs:documentation>아래 여백. 단위는 HWPUNIT.</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:attributeGroup>
<xs:attributeGroup name="BorderAttributeGroup">
<xs:annotation>
<xs:documentation>테두리에서 공통적으로 사용되는 속성 묶음</xs:documentation>
</xs:annotation>
<xs:attribute name="type" default="Solid">
<xs:annotation>
<xs:documentation>테두리선종류</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="Solid">
<xs:annotation>
<xs:documentation>실선</xs:documentation>
</xs:annotation>
</xs:enumeration>

<xs:enumeration value="Dash">
<xs:annotation>
<xs:documentation>긴 점선</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="Dot">
<xs:annotation>
<xs:documentation>점선</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DashDot">
<xs:annotation>
<xs:documentation>-.-.-.-.</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DashDotDot">
<xs:annotation>
<xs:documentation>-..-..-..</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="LongDash">
<xs:annotation>
</xs:e
<xs:enT
<xs:
documentation>Dash보다 긴 선의 반복</xs:documentation>
/xs:annotation>
numeration>
umeration val-ue="CirMcle">
<xs:annotation>
<xs:documentation>Dot보다 큰 동그미의 반복</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DoubleSlim">
<xs:annotation>
<xs:documentation>2중선</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="SlimThick">
<xs:annotation>
<xs:documentation>가는 선+ 굵은 선2중선</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="ThickSlim">
<xs:annotation>
<xs:documentation>굵은 선+ 가는 선2중선</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="SlimThickSlim">
<xs:annotation>
<xs:documentation>가는 선+ 굵은 선+ 가는 선3중선</xs:documentation>

</xs:annotation>
</xs:enumeration>
<xs:enumeration value="None">
<xs:annotation>
<xs:documentation>선없음</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="width" default="0.12mm">
<xs:annotation>
<xs:documentation>테두리선굵기.</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="0.1mm"/>
<xs:enumeration value="0.12mm"/>
<xs:enumeration value="0.15mm"/>
<xs:enumeration value="0.2mm"/>
<xs:enumeration value="0.25mm"/>
<xs:enumeration value="0.3mm"/>
<xs:enumeration value="0.4mm"/>
<xs:enT
umeratiS
on value="0.5mm"/>
<xs:enumeration val-
ue="0.6mm"/>
<xs:enumeration value="0.7
<xs:enumeration value="1.0mm"/>
<xs:enumeration value="1.5mm"/>
<xs:enumeration value="2.0mm"/>
<xs:enumeration value="3.0mm"/>
<xs:enumeration value="4.0mm"/>
<xs:enumeration value="5.0mm"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="color" type="xs:positiveInteger">
<xs:annotation>
<xs:documentation>테두리선색상. RGB값(0x00bbggrr)을 십진수로
표시.</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:attributeGroup>
<xs:complexType name="HWPValue">
<xs:annotation>
<xs:documentation>(값, 단위)을 표현하기 위한 엘리먼트</xs:documentation>
</xs:annotation>
<xs:attribute name="value" type="xs:integer" use="required"/>
<xs:attribute name="unit" use="optional" default="HWPUNIT">

<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="CHAR"/>
<xs:enumeration value="HWPUNIT"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
<xs:complexType name="ImageType">
<xs:annotation>
<xs:documentation>그림 정보</xs:documentation>
</xs:annotation>
<xs:attribute name="binaryItemIDRef" type="xs:string" use="required">
<xs:annotation>
<xs:documentation>menifest의 item 엘리먼트의 아이디 참조 값</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="bright" type="xs:integer" default="0">
<xs:annotation>
<xs:documentation>밝기</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="contrast" type="xs:integer" default="0">
<xs:annotation>
<xs:documentation>명암</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="effect" default="REAL_PIC">
<xs:annotation>
<xs:documentation>그림 효과</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="REAL_PIC">
<xs:annotation>
<xs:documentation>원래 그림에서</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="GRAY_SCALE">
<xs:annotation>
<xs:documentation>그레이스케일로</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="BLACK_WHITE">
<xs:annotation>
<xs:documentation>흑백으로</xs:documentation>
</xs:annotation>
</xs:enumeration>

</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="alpha" type="xs:float"/>
</xs:complexType>
<xs:complexType name="MatrixType">
<xs:annotation>
<xs:documentation>행렬 정보</xs:documentation>
</xs:annotation>
<xs:attribute name="e1" type="xs:float"/>
<xs:attribute name="e2" type="xs:float"/>
<xs:attribute name="e3" type="xs:float"/>
<xs:attribute name="e4" type="xs:float"/>
<xs:attribute name="e5" type="xs:float"/>
<xs:attribute name="e6" type="xs:float"/>
</xs:complexType>
<xs:complexType name="PointType">
<xs:annotation>
<xs:documentation>Point 정보</xs:documentation>
</xs:annotation>
<xs:attribute name="x" type="xs:integer"/>
<xs:attribute name="y" type="xs:integer"/>
<
/xs:c
<xs:c
om
plexType>
omplexTypeA
 name="FT
illBrushType">
<xs:annotation>
<xs:documentation>채우S기 정-보</xs:dMocumentatioOn>
</xs:annotation>
<xs:choice>
<xs:element name="winBrush" minOccurs="1">
<xs:annotation>
<xs:documentation>면 채우기</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="faceColor" type="hc:RGBColorType" default="#FFFFFF">
<xs:annotation>
<xs:documentation>면 색</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="hatchColor" type="hc:RGBColorType" default="#000000">
<xs:annotation>
<xs:documentation>무늬 색</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="hatchStyle">
<xs:annotation>
<xs:documentation>무늬 종류</xs:documentation>
</xs:annotation>
<xs:simpleType>

<xs:restriction base="xs:string">
<xs:enumeration value="HORIZONTAL">
<xs:annotation>
<xs:documentation>- - - -</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="VERTICAL">
<xs:annotation>
<xs:documentation>|||||</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="BACK_SLASH">
<xs:annotation>
<xs:documentation>\\\\\</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="SLASH">
<xs:annotation>
<xs:documentation>/////</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CROSS">
<
xs:annotation>
<xs:documentation>+++++</xs:documentation>
</xs:annM
otation>
</xs:enumeration>
<xs:enumeration value="CROSS_DIAGONAL">
<xs:annotation>
<xs:documentation>xxxxx</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="alpha" type="xs:float"/>
</xs:complexType>
</xs:element>
<xs:element name="gradation" minOccurs="1">
<xs:annotation>
<xs:documentation>그러데이션 효과</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:sequence>
<xs:element name="color" minOccurs="0" maxOccurs="unbounded">
<xs:annotation>
<xs:documentation>그러데이션 색</xs:documentation>
</xs:annotation>
<xs:complexType>

<xs:attribute name="value" type="hc:RGBColorType" use="required"/>
</xs:complexType>
</xs:element>
</xs:sequence>
<xs:attribute name="type">
<xs:annotation>
<xs:documentation>그러데이션 유형</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="LINEAR">
<xs:annotation>
<xs:documentation>줄무늬형</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="RADIAL">
<xs:annotation>
<xs:documentation>원형</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CONICAL">
<xs:annotation>
</xs:e
<xs:e-
<xs
:documentation>원뿔형</xs:documentation>
/xs:annotation>
numeration>
numeration value="SQUARE"T>
<xs:annotation>
<xs:documentation>사각형</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="angle" type="xs:integer" default="90">
<xs:annotation>
<xs:documentation>그러데이션의 기울임(시작각)</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="centerX" type="xs:integer" default="0">
<xs:annotation>
<xs:documentation>그러데이션의 가로중심(중심 X좌표)</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="centerY" type="xs:integer" default="0">
<xs:annotation>
<xs:documentation>그러데이션의 세로중심(중심 Y좌표)</xs:documentation>
</xs:annotation>
</xs:attribute>

<xs:attribute name="step" default="255">
<xs:annotation>
<xs:documentation>그러데이션 번짐정도 (0~255)</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="0"/>
<xs:maxInclusive value="255"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="colorNum" type="xs:nonNegativeInteger" default="2">
<xs:annotation>
<xs:documentation>그러데이션의 색수</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="stepCenter" default="50">
<xs:annotation>
<xs:documentation>그러데이션 번짐정도의 중심 (0~100)</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="0"/>
<xs:m-
axIncluM
sive value="100"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="alpha" type="xs:float"/>
</xs:complexType>
</xs:element>
<xs:element name="imgBrush" minOccurs="1">
<xs:annotation>
<xs:documentation>그림으로 채우기</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:sequence>
<xs:element name="img" type="hc:ImageType"/>
</xs:sequence>
<xs:attribute name="mode" default="TILE">
<xs:annotation>
<xs:documentation>채우기 유형</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="TILE">
<xs:annotation>
<xs:documentation>바둑판식으로-모두</xs:documentation>
</xs:annotation>

</xs:enumeration>
<xs:enumeration value="TILE_HORZ_TOP">
<xs:annotation>
<xs:documentation>바둑판식으로-가로/위</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="TILE_HORZ_BOTTOM">
<xs:annotation>
<xs:documentation>바둑판식으로-
가로/아래</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="TILE_VERT_LEFT">
<xs:annotation>
<xs:documentation>바둑판식으로-
세로/왼쪽</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="TILE_VERT_RIGHT">
<xs:annotation>
<xs:documentation>바둑판식으로-
세로/오른쪽</xs:documentation>
</xs:e
<xs:e-
/xs:ann
numera
numeraM
otation>
tion>
tion value="TOTAL">
<xs:annotation>
<xs:documentation>크기에 맞추어</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CENTER">
<xs:annotation>
<xs:documentation>가운데로</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CENTER_TOP">
<xs:annotation>
<xs:documentation>가운데 위로</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CENTER_BOTTOM">
<xs:annotation>
<xs:documentation>가운데 아래로</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="LEFT_CENTER">
<xs:annotation>
<xs:documentation>왼쪽 가운데로</xs:documentation>
</xs:annotation>

</xs:enumeration>
<xs:enumeration value="LEFT_TOP">
<xs:annotation>
<xs:documentation>왼쪽 위로</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="LEFT_BOTTOM">
<xs:annotation>
<xs:documentation>왼쪽 아래로</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="RIGHT_CENTER">
<xs:annotation>
<xs:documentation>오른쪽 가운데로</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="RIGHT_TOP">
<xs:annotation>
<xs:documentation>오른쪽 위로</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="RIGHT_BOTTOM">
<
<-
xs:ann
otation>
<xs:documentation>오른쪽 아래로</xs:documentation>
/xs:annotation>
</xs:enumeration>
<xs:enumeration value="ZOOM">
<xs:annotation>
<xs:documentation>TODO:설명 추가</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
</xs:element>
</xs:choice>
</xs:complexType>
<xs:complexType name="KeyEncryptionType">
<xs:sequence>
<xs:element name="derivationKey">
<xs:complexType>
<xs:attribute name="algorithm" type="xs:string"/>
<xs:attribute name="size" type="xs:nonNegativeInteger"/>
<xs:attribute name="count" type="xs:nonNegativeInteger"/>
<xs:attribute name="salt" type="xs:base64Binary"/>
</xs:complexType>
</xs:element>

<xs:element name="hash" type="xs:base64Binary"/>
</xs:sequence>
</xs:complexType>
<xs:complexType name="MetaTagType" mixed="true"/>
</xs:schema>
```
