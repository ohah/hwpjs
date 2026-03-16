# 부속서 E (규정) ParaList XML 스키마

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
xmlns:hp="http://www.owpml.org/owpml/2024/paragraph" xmlns:hc="http://www.owpml.org/owpml/2024/core"
targetNamespace="http://www.owpml.org/owpml/2024/paragraph" elementFormDefault="qualified">
<xs:import namespace="http://www.owpml.org/owpml/2024/core"
schemaLocation="HWPMLCoreSchema.xsd"/>
<xs:import namespace="http://www.w3.org/XML/1998/namespace"
schemaLocation="http://www.w3.org/2001/xml.xsd"/>
<xs:complexType name="SectionType">
<xs:sequence>
<xs:element name="p" type="hp:PType" maxOccurs="unbounded"/>
</xs:sequence>
</xs:complexType>
<xs:complexType name="ParaListType">
<xs:sequence>
<xs:element name="p" type="hp:PType" maxOccurs="unbounded"/>
</xs:sequence>
<xs:attribute name="id" type="xs:string" use="required"/>
<xs:attribute name="textDirection" default="HORIZONTAL"><xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="HORIZONTAL"/>
<xs:enumeration value="VERTICAL"/>
<xs:enumeration value="VERTICALALL">
<xs:annotation>
<xs:documentation>세로 영문 세움</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="lineWrap" default="BREAK">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="BREAK"/>
<xs:enumeration value="SQUEEZE"/>
<xs:enumeration value="KEEP"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="vertAlign" default="TOP">

<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="TOP"/>
<xs:enumeration value="CENTER"/>
<xs:enumeration value="BOTTOM"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="linkListIDRef" type="xs:nonNegativeInteger"/>
<xs:attribute name="linkListNextIDRef" type="xs:nonNegativeInteger"/>
<xs:attribute name="textWidth" type="xs:nonNegativeInteger">
<xs:annotation>
<xs:documentation>텍스트 영역의 폭</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="textHeight" type="xs:nonNegativeInteger">
<xs:annotation>
<xs:documentation>텍스트 영역의 높이</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="hasTextRef" type="xs:boolean" default="false">
<xs:annotation>
<x
s:documentation>해당 레벨의 텍스트에 대한 참조를 했는지 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="hTasNumSRef" ty-pe="xs:Mboolean" deOfault="falsTe">
<xs:annotation>
<xs:documentation>해당 레벨의 번호에 대한 참조를 했는지 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
<xs:complexType name="PType">
<xs:annotation>
<xs:documentation>문단</xs:documentation>
</xs:annotation>
<xs:sequence minOccurs="1" maxOccurs="1">
<xs:element name="run" maxOccurs="unbounded">
<xs:complexType>
<xs:choice minOccurs="0" maxOccurs="unbounded">
<xs:element name="secPr" type="hp:SectionDefinitionType" minOccurs="1"/>
<xs:element name="ctrl">
<xs:complexType>
<xs:choice minOccurs="1" maxOccurs="unbounded">
<xs:element name="colPr" type="hp:ColumnDefType"
minOccurs="1"/>
<xs:element name="fieldBegin">
<xs:complexType>
<xs:sequence minOccurs="0">

<xs:element name="parameters"
type="hp:ParameterList" minOccurs="0"/>
<xs:element name="subList" type="hp:ParaListType"
minOccurs="0"/>
<xs:element name="metaTag"
type="hc:MetaTagType" minOccurs="0"/>
</xs:sequence>
<xs:attribute name="id" type="xs:nonNegativeInteger"
use="required"/>
<xs:attribute name="type" type="hp:FieldType"
use="required"/>
<xs:attribute name="name" type="xs:string"/>
<xs:attribute name="editable" type="xs:boolean"
default="true"/>
<xs:attribute name="dirty" type="xs:boolean"
default="false"/>
<xs:attribute name="zorder" type="xs:integer"/>
<xs:attribute name="fieldid" type="xs:nonNegativeInteger"/>
</xs:complexType>
</xs:element>
<xs:element name="fieldEnd">
<xs:complexType>
typ
e="
xs:n
onNK
egativeIA
nteger" uT
se="reqS
uired"-
/>
<xs:attribute name="beginIDRef"
<xs:attribuO
te name="
fieldid" tI
ypeE
="xs:unsignedInt"/>
</xs:complexType>
</xs:element>
<xs:element name="bookmark">
<xs:complexType>
<xs:attribute name="name" type="xs:string"/>
</xs:complexType>
</xs:element>
<xs:element name="header" type="hp:HeaderFooterType"/>
<xs:element name="footer" type="hp:HeaderFooterType"/>
<xs:element name="footNote" type="hp:NoteType"/>
<xs:element name="endNote" type="hp:NoteType"/>
<xs:element name="autoNum" type="hp:AutoNumNewNumType"/>
<xs:element name="newNum" type="hp:AutoNumNewNumType"/>
<xs:element name="pageNumCtrl">
<xs:complexType>
<xs:attribute name="pageStartsOn" default="BOTH">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="BOTH"/>
<xs:enumeration value="EVEN"/>
<xs:enumeration value="ODD"/>
</xs:restriction>
</xs:simpleType>

</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="pageHiding">
<xs:complexType>
<xs:attribute name="hideHeader" type="xs:boolean"
default="false"/>
<xs:attribute name="hideFooter" type="xs:boolean"
default="false"/>
<xs:attribute name="hideMasterPage" type="xs:boolean"
default="false"/>
<xs:attribute name="hideBorder" type="xs:boolean"
default="false"/>
<xs:attribute name="hideFill" type="xs:boolean"
default="false"/>
<xs:attribute name="hidePageNum" type="xs:boolean"
default="false"/>
</xs:complexType>
</xs:element>
<xs:element name="pageNum">
<xs:complexType>
<xs:attribute name="pos" default="TOP_LEFT">
         KATS-M
<xs:a
nnotation>
<xs:documT
entation>번호
위치</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="NONE"/>
<xs:enumeration value="TOP_LEFT"/>
<xs:enumeration value="TOP_CENTER"/>
<xs:enumeration value="TOP_RIGHT"/>
<xs:enumeration value="BOTTOM_LEFT"/>
<xs:enumeration
value="BOTTOM_CENTER"/>
<xs:enumeration
value="BOTTOM_RIGHT"/>
<xs:enumeration value="OUTSIDE_TOP"/>
<xs:enumeration
value="OUTSIDE_BOTTOM"/>
<xs:enumeration value="INSIDE_TOP"/>
<xs:enumeration
value="INSIDE_BOTTOM"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="formatType" type="hc:NumberType1"
default="DIGIT">

<xs:annotation>
<xs:documentation>번호
모양</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="sideChar" type="xs:string" default="-">
<xs:annotation>
<xs:documentation>줄표 넣기
기능</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="indexmark">
<xs:complexType>
<xs:sequence>
<xs:element name="firstKey"/>
<xs:element name="secondKey"/>
</xs:sequence>
</xs:complexType>
</xs:element>
<xs:element name="hiddenComment">
<xs
:complexTy
pe>
<xs:sequence>
<xs:element naT
me="subI
LisE
t" type="hp:ParaListType"/>
</xs:sequence>
</xs:complexType>
</xs:element>
</xs:choice>
</xs:complexType>
</xs:element>
<xs:element name="t">
<xs:complexType mixed="true">
<xs:choice minOccurs="0" maxOccurs="unbounded">
<xs:element name="markpenBegin" minOccurs="1">
<xs:complexType>
<xs:attribute name="color" type="hc:RGBColorType"/>
</xs:complexType>
</xs:element>
<xs:element name="markpenEnd" minOccurs="1"/>
<xs:element name="titleMark" minOccurs="1">
<xs:complexType>
<xs:attribute name="ignore" type="xs:boolean"
default="false"/>
</xs:complexType>
</xs:element>
<xs:element name="tab" minOccurs="1">
<xs:annotation>

<xs:documentation>Attribute의 width 단위는 hwp unit
                                            </xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="width" type="xs:nonNegativeInteger"/>
<xs:attribute name="leader" type="hc:LineType2"/>
<xs:attribute name="type" use="required">
<xs:annotation>
<xs:documentation>탭의
종류</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="LEFT">
<xs:annotation>
<xs:documentation>왼쪽</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="RIGHT">
<xs:annotation>
<
xs:d
ocu
mentatio
n>오른쪽
</xs:do
cumen
tation>
<T
/xs:annotation>
</xs:enumeration>
<xs:enumeration value="CENTER">
<xs:annotation>
<xs:documentation>가운데</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DECIMAL">
<xs:annotation>
<xs:documentation>소수점</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="lineBreak" minOccurs="1"/>
<xs:element name="hyphen" minOccurs="1"/>
<xs:element name="nbSpace" minOccurs="1"/>
<xs:element name="fwSpace" minOccurs="1"/>
<xs:element name="insertBegin" type="hp:TrackChangeTag"/>
<xs:element name="insertEnd" type="hp:TrackChangeTag"/>

<xs:element name="deleteBegin" type="hp:TrackChangeTag"/>
<xs:element name="deleteEnd" type="hp:TrackChangeTag"/>
</xs:choice>
<xs:attribute name="charStyleIDRef" type="xs:nonNegativeInteger"/>
</xs:complexType>
</xs:element>
<xs:element name="tbl" type="hp:TableType"/>
<xs:element name="pic" type="hp:PictureType"/>
<xs:element name="ole" type="hp:OLEType"/>
<xs:element name="container" type="hp:ContainerType"/>
<xs:element name="equation" type="hp:EquationType"/>
<xs:element name="line" type="hp:LineType"/>
<xs:element name="rect" type="hp:RectangleType"/>
<xs:element name="ellipse" type="hp:EllipseType"/>
<xs:element name="arc" type="hp:ArcType"/>
<xs:element name="polygon" type="hp:PolygonType"/>
<xs:element name="curve" type="hp:CurveType"/>
<xs:element name="connectLine" type="hp:ConnectLineType"/>
<xs:element name="textart">
<xs:complexType>
<xs:complexContent>
<xs:extension base="hp:AbstractDrawingObjectType">
<xs
:sequence>
<xs:elemeO
nt name="
pt0" typI
e="hE
c:PointType"/>
<xs:element name="pt1" type="hc:PointType"/>
<xs:element name="pt2" type="hc:PointType"/>
<xs:element name="pt3" type="hc:PointType"/>
<xs:element name="textartPr">
<xs:complexType>
<xs:sequence>
<xs:element name="shadow"
type="hp:ShadowType"/>
</xs:sequence>
<xs:attribute name="fontName" type="xs:string"/>
<xs:attribute name="fontStyle" type="xs:string"
default="REGULAR"/>
<xs:attribute name="fontType" default="TTF">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="TTF"/>
<xs:enumeration value="HTF"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="textShape">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration

value="PARALLELOGRAM"/>
<xs:enumeration
value="INVERTED_PARALLELOGRAM"/>
<xs:enumeration
value="INVERTED_UPWARD_CASCADE"/>
<xs:enumeration
value="INVERTED_DOWNWARD_CASCADE"/>
<xs:enumeration
value="UPWARD_CASCADE"/>
<xs:enumeration
value="DOWNWARD_CASCADE"/>
<xs:enumeration
value="REDUCE_RIGHT"/>
<xs:enumeration
value="REDUCE_LEFT"/>
<xs:enumeration
value="ISOSCELES_TRAPEZOID"/>
<xs:enumeration
value="INVERTED_ISOSCELES_TRAPEZOID"/>
<xs:enumeration
value="TOP_RIBBON_RECTANGLE"/>
<xs:enumeration
val
ue="BO
OM_RIBB
ON_RE
CTANGLE"/>
<xs:enumeration
value="CHEVRON_DOWN"/> S-MOT<xsI:enuEmeration
value="CHEVRON"/>
<xs:enumeration
value="BOW_TIE"/>
<xs:enumeration
value="HEXAGON"/>
<xs:enumeration
value="WAVE1"/>
<xs:enumeration
value="WAVE2"/>
<xs:enumeration
value="WAVE3"/>
<xs:enumeration
value="WAVE4"/>
<xs:enumeration
value="LEFT_TILT_CYLINDER"/>
<xs:enumeration
value="RIGHT_TILT_CYLINDER"/>
<xs:enumeration
value="BOTTOM_WIDE_CYLINDER"/>
<xs:enumeration
value="TOP_WIDE_CYLINDER"/>
<xs:enumeration

value="THIN_CURVE_UP1"/>
<xs:enumeration
value="THIN_CURVE_UP2"/>
<xs:enumeration
value="THIN_CURVE_DOWN1"/>
<xs:enumeration
value="THIN_CURVE_DOWN2"/>
<xs:enumeration
value="INVERSED_FINGERNAIL"/>
<xs:enumeration
value="FINGERNAIL"/>
<xs:enumeration
value="GINKO_LEAF1"/>
<xs:enumeration
value="GINKO_LEAF2"/>
<xs:enumeration
value="INFLATE_RIGHT"/>
<xs:enumeration
value="INFLATE_LEFT"/>
<xs:enumeration
value="INFLATE_UP_CONVEX"/>
<xs:enumeration
val
ue="INF
LA
TE_BOT
TOM_CO
NVEX"
/>
<xsI
:enuE
meration
value="DEFLATE_TOP"/>
<xs:enumeration
value="DEFLATE_BOTTOM"/>
<xs:enumeration
value="DEFLATE"/>
<xs:enumeration
value="INFLATE"/>
<xs:enumeration
value="INFLATE_TOP"/>
<xs:enumeration
value="INFLATE_BOTTOM"/>
<xs:enumeration
value="RECTANGLE"/>
<xs:enumeration
value="LEFT_CYLINDER"/>
<xs:enumeration
value="CYLINDER"/>
<xs:enumeration
value="RIGHT_CYLINDER"/>
<xs:enumeration
value="CIRCLE"/>
<xs:enumeration
value="CURVE_DOWN"/>
<xs:enumeration

value="ARCH_UP"/>
<xs:enumeration
value="ARCH_DOWN"/>
<xs:enumeration
value="SINGLE_LINE_CIRCLE1"/>
<xs:enumeration
value="SINGLE_LINE_CIRCLE2"/>
<xs:enumeration
value="TRIPLE_LINE_CIRCLE1"/>
<xs:enumeration
value="TRIPLE_LINE_CIRCLE2"/>
<xs:enumeration
value="DOUBLE_LINE_CIRCLE"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="lineSpacing" default="120">
<xs:simpleType>
<xs:restriction
base="xs:nonNegativeInteger">
<xs:minInclusive value="50"/>
<xs:maxInclusive value="500"/>
         KATS-MO
</xs:restriction>
</xs:simpleType>
</xs:attribuT
te>
<xs:attribute nameI="chEarSpacing" default="100">
<xs:simpleType>
<xs:restriction
base="xs:nonNegativeInteger">
<xs:minInclusive value="50"/>
<xs:maxInclusive value="500"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="align" default="LEFT">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="LEFT"/>
<xs:enumeration value="RIGHT"/>
<xs:enumeration
value="CENTER"/>
<xs:enumeration value="FULL"/>
<xs:enumeration value="TABLE"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
</xs:element>

<xs:element name="outline">
<xs:complexType>
<xs:sequence>
<xs:element name="pt" type="hc:PointType"
minOccurs="0" maxOccurs="unbounded"/>
</xs:sequence>
<xs:attribute name="cnt"
type="xs:nonNegativeInteger"/>
</xs:complexType>
</xs:element>
</xs:sequence>
<xs:attribute name="text" type="xs:string"/>
</xs:extension>
</xs:complexContent>
</xs:complexType>
</xs:element>
<xs:element name="compose">
<xs:complexType>
<xs:sequence>
<xs:element name="charPr" maxOccurs="unbounded">
<xs:complexType>
<xs:attribute name="prIDRef"
typ
e="
xs:n
onN
egativeI
nteger"/>
</x
</xs:eleM
s:complexType>
ment>
</xs:sequence>
<xs:attribute name="circleType" default="SHAPE_CIRCLE">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="CHAR"/>
<xs:enumeration value="SHAPE_CIRCLE"/>
<xs:enumeration value="SHAPE_REVERSAL_CIRCLE"/>
<xs:enumeration value="SHAPE_RECTANGLE"/>
<xs:enumeration
value="SHAPE_REVERSAL_RECTANGLE"/>
<xs:enumeration value="SHAPE_TRIANGLE"/>
<xs:enumeration
value="SHAPE_REVERSAL_TIRANGLE"/>
<xs:enumeration value="SHAPE_LIGHT"/>
<xs:enumeration value="SHAPE_RHOMBUS"/>
<xs:enumeration
value="SHAPE_REVERSAL_RHOMBUS"/>
<xs:enumeration
value="SHAPE_ROUNDED_RECTANGLE"/>
<xs:enumeration
value="SHAPE_EMPTY_CIRCULATE_TRIANGLE"/>
<xs:enumeration
value="SHAPE_THIN_CIRCULATE_TRIANGLE"/>

<xs:enumeration
value="SHAPE_THICK_CIRCULATE_TRIANGLE"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="charSz" type="xs:integer">
<xs:annotation>
<xs:documentation>테두리 내부 글자의 크기 비율.
단위 %.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="composeType">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="SPREAD"/>
<xs:enumeration value="OVERLAP"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="charPrCnt" type="xs:nonNegativeInteger"/>
<xs:attribute name="composeText" type="xs:string"/>
</xs:complexType>
<
/xs:elem
<xs:elem
<xs:S
ent>
ent name="dutmal">
complexType>
<xs:s-equencMe>
<xs:element name="mainText"/>
<xs:element name="subText"/>
</xs:sequence>
<xs:attribute name="posType" default="TOP">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="TOP"/>
<xs:enumeration value="BOTTOM"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="szRatio" type="xs:positiveInteger"/>
<xs:attribute name="option" type="xs:unsignedInt" fixed="4"/>
<xs:attribute name="styleIDRef" type="xs:nonNegativeInteger"/>
<xs:attribute name="align" default="CENTER">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="JUSTIFY"/>
<xs:enumeration value="LEFT"/>
<xs:enumeration value="RIGHT"/>
<xs:enumeration value="CENTER"/>
<xs:enumeration value="DISTRIBUTE"/>

<xs:enumeration value="DISTRIBUTE_SPACE"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="btn" type="hp:AbstractButtonObjectType"/>
<xs:element name="radioBtn" type="hp:AbstractButtonObjectType"/>
<xs:element name="checkBtn" type="hp:AbstractButtonObjectType"/>
<xs:element name="comboBox" type="hp:ComboBoxType"/>
<xs:element name="listBox" type="hp:ListBoxType"/>
<xs:element name="edit" type="hp:EditType"/>
<xs:element name="scrollBar" type="hp:ScrollBarType"/>
<xs:element name="video">
<xs:complexType>
<xs:complexContent>
<xs:extension base="hp:AbstractShapeComponentType">
<xs:attribute name="videotype" use="required">
<xs:annotation>
<xs:documentation>비디오 종류</xs:documentation>
</xs:annotation>
<xs:simpleType>
         KATS-M
<xs:r
estriction b
ase="xs:string">
<xs:enumeration vI
alueE
="Local">
<xs:annotation>
<xs:documentation>컴퓨터의
동영상</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="Web">
<xs:annotation>
<xs:documentation>인터넷
동영상</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="fileIDRef" type="xs:string" use="optional"/>
<xs:attribute name="imageIDRef" type="xs:string"
use="optional"/>
<xs:attribute name="tag" type="xs:string" use="optional"/>
</xs:extension>
</xs:complexContent>
</xs:complexType>
</xs:element>
<xs:element name="chart">
<xs:complexType>

<xs:complexContent>
<xs:extension base="hp:AbstractShapeObjectType">
<xs:attribute name="version" type="xs:float"/>
<xs:attribute name="chartIDRef" type="xs:string"/>
</xs:extension>
</xs:complexContent>
</xs:complexType>
</xs:element>
</xs:choice>
<xs:attribute name="charPrIDRef" type="xs:nonNegativeInteger"/>
<xs:attribute name="charTcId" type="xs:nonNegativeInteger" use="optional"/>
</xs:complexType>
</xs:element>
</xs:sequence>
<xs:attribute name="id" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="paraPrIDRef" type="xs:nonNegativeInteger"/>
<xs:attribute name="styleIDRef" type="xs:nonNegativeInteger"/>
<xs:attribute name="pageBreak" type="xs:boolean" default="false"/>
<xs:attribute name="columnBreak" type="xs:boolean" default="false"/>
<xs:attribute name="merged" type="xs:boolean" default="false"/>
<xs:attribute name="paraTcId" type="xs:nonNegativeInteger" use="optional"/>
</xs:complexType>
<
xs:c
omp
lexType
 name="
ectionD
efinitionType">
<xs:sequence>
<xs:element name="startNum" minOccurs="0">
<xs:annotation>
<xs:documentation>시작 번호 정보</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="pageStartsOn" default="BOTH">
<xs:annotation>
<xs:documentation>구역 나눔으로 새 페이지가 생길 때 페이지 번호 적용
옵션
                            </xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="BOTH"/>
<xs:enumeration value="EVEN"/>
<xs:enumeration value="ODD"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="page" type="xs:nonNegativeInteger" default="0">
<xs:annotation>
<xs:documentation>쪽 시작 번호</xs:documentation>
</xs:annotation>
</xs:attribute>

<xs:attribute name="pic" type="xs:nonNegativeInteger" default="0">
<xs:annotation>
<xs:documentation>그림 시작 번호</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="tbl" type="xs:nonNegativeInteger" default="0">
<xs:annotation>
<xs:documentation>표 시작 번호</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="equation" type="xs:nonNegativeInteger" default="0">
<xs:annotation>
<xs:documentation>수식 시작 번호</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="grid" minOccurs="0">
<xs:annotation>
<xs:documentation>줄맞춤 정보</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="
<T
xs:annoS
tation>
<xs:docum-
lineGrid
" type="xs:nonNegativeInteger" default="0">
entation>세로로 줄O
맞춤을 할T
지 여부I
</xsE
:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="charGrid" type="xs:nonNegativeInteger" default="0">
<xs:annotation>
<xs:documentation>가로로 줄맞춤을 할지 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="wonggojiFormat" type="xs:boolean" default="0">
<xs:annotation>
<xs:documentation>원고지 형식 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="visibility" minOccurs="0">
<xs:annotation>
<xs:documentation>감추기/보여주기 정보</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="hideFirstHeader" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>첫 쪽에만 머리말 감추기 여부</xs:documentation>
</xs:annotation>

</xs:attribute>
<xs:attribute name="hideFirstFooter" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>첫 쪽에만 꼬리말 감추기 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="hideFirstMasterPage" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>첫 쪽에만 바탕쪽 감추기 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="border" type="hp:VisibilityValue"/>
<xs:attribute name="fill" type="hp:VisibilityValue"/>
<xs:attribute name="hideFirstPageNum" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>첫 쪽에만 쪽번호 감추기 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="hideFirstEmptyLine" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>첫 쪽에만 빈줄 감추기 여부</xs:documentation>
</xs:annotation>
</xs:a
<xs:atT
ttribute>
tribute nS
ame="showLineNumber" type="xs:boolean" default="false">
<xs:annotation>
<xs:docum-entatioMn>줄 번호 표O시 여부<T/xs:docu
을 금지합니다.
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="lineNumberShape" minOccurs="0">
<xs:annotation>
<xs:documentation>줄 번호 정보</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="restartType" type="xs:unsignedInt">
<xs:annotation>
<xs:documentation>줄 번호 방식</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="countBy" type="xs:unsignedInt">
<xs:annotation>
<xs:documentation>줄 번호 표시 간격</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="distance" type="xs:unsignedInt">
<xs:annotation>
<xs:documentation>본문과의 줄 번호 위치</xs:documentation>

</xs:annotation>
</xs:attribute>
<xs:attribute name="startNumber" type="xs:unsignedInt">
<xs:annotation>
<xs:documentation>줄 번호 시작 번호</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="pagePr" minOccurs="0">
<xs:annotation>
<xs:documentation>용지 설정 정보</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:sequence>
<xs:element name="margin">
<xs:complexType>
<xs:attributeGroup ref="hc:MarginAttributeGroup"/>
<xs:attribute name="header" type="xs:nonNegativeInteger"
default="4252">
<xs:annotation>
<xs:documentation>머리말 여백</xs:documentation>
</xs:a
<xs:a-
/xs:ann
ttribute
ttribute
otation>
>
name="footeO
r" type="xT
s:nonNeI
gatiE
veInteger" default="4252">
<xs:annotation>
<xs:documentation>꼬리말 여백</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="gutter" type="xs:nonNegativeInteger" default="0">
<xs:annotation>
<xs:documentation>제본 여백</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
</xs:sequence>
<xs:attribute name="landscape" default="NARROWLY">
<xs:annotation>
<xs:documentation>용지 방향</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="WIDELY"/>
<xs:enumeration value="NARROWLY"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>

<xs:attribute name="width" type="xs:positiveInteger" default="59528">
<xs:annotation>
<xs:documentation>용지 가로 크기. 단위는 HWPUNIT.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="height" type="xs:positiveInteger" default="84188">
<xs:annotation>
<xs:documentation>용지 세로 크기. 단위는 HWPUNIT.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="gutterType" default="LEFT_ONLY">
<xs:annotation>
<xs:documentation>제책 방법</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="LEFT_ONLY"/>
<xs:enumeration value="LEFT_RIGHT"/>
<xs:enumeration value="TOP_BOTTOM"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="footNotePr" type="hp:FootNoteShapeType" minOccurs="0">
<xs:annotation>
<xs:documentation>각주 모양</xs:documentation>
</xs:annotation>
</xs:element>
<xs:element name="endNotePr" type="hp:EndNoteShapeType" minOccurs="0">
<xs:annotation>
<xs:documentation>미주 모양</xs:documentation>
</xs:annotation>
</xs:element>
<xs:element name="pageBorderFill" minOccurs="0" maxOccurs="3">
<xs:annotation>
<xs:documentation>쪽 테두리/배경 정보</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:sequence>
<xs:element name="offset">
<xs:annotation>
<xs:documentation>테두리/배경 위치</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="left" type="xs:nonNegativeInteger" default="1417">
<xs:annotation>
<xs:documentation>왼쪽 간격. 단위는

HWPUNIT.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="right" type="xs:nonNegativeInteger" default="1417">
<xs:annotation>
<xs:documentation>오른쪽 간격. 단위는
HWPUNIT.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="top" type="xs:nonNegativeInteger" default="1417">
<xs:annotation>
<xs:documentation>위쪽 간격. 단위는
HWPUNIT.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="bottom" type="xs:nonNegativeInteger"
default="1417">
<xs:annotation>
<xs:documentation>아래쪽 간격. 단위는
HWPUNIT.</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs
:comp
lexType>
</xs:element>
</xs:sequence>
<xs:attribute name="type">
<xs:annotation>
<xs:documentation>종류</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="BOTH">
<xs:annotation>
<xs:documentation>양쪽</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="EVEN">
<xs:annotation>
<xs:documentation>짝수쪽</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="ODD">
<xs:annotation>
<xs:documentation>홀수쪽</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>

</xs:attribute>
<xs:attribute name="borderFillIDRef" type="xs:nonNegativeInteger">
<xs:annotation>
<xs:documentation>테두리/배경 아이디 참조 값</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="textBorder">
<xs:annotation>
<xs:documentation>쪽 테두리 위치 기준</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="CONTENT">
<xs:annotation>
<xs:documentation>본문 기준</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="PAPER">
<xs:annotation>
<xs:documentation>종이 기준</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:aT
</xs:restriction>
/xs:simpleType>
ttribute>
<xs:attribute nSame=-"headerMInside" type=
<xs:annotation>
<xs:documentation>머리말 포함 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="footerInside" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>꼬리말 포함 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="fillArea">
<xs:annotation>
<xs:documentation>채울 영역</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="PAPER">
<xs:annotation>
<xs:documentation>종이</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="PAGE">
<xs:annotation>

<xs:documentation>쪽</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="BORDER">
<xs:annotation>
<xs:documentation>테두리</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="masterPage" minOccurs="0" maxOccurs="unbounded">
<xs:annotation>
<xs:documentation>바탕쪽 정보</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="idRef" type="xs:string" use="required"/>
</xs:complexType>
</xs:element>
<xs:element name="presentation" minOccurs="0">
<x
</xA
s:annotation>
<xs:documentation>프레젠테이션 정보</xs:documentation>
s:annotation>
<xs:complexType>
<xs:sequence>
<xs:element name="fillBrush" type="hh:fillBrushType" minOccurs="0">
<xs:annotation>
<xs:documentation>채우기 정보</xs:documentation>
</xs:annotation>
</xs:element>
</xs:sequence>
<xs:attribute name="effect">
<xs:annotation>
<xs:documentation>화면 전환 효과</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="none"/>
<xs:enumeration value="overLeft"/>
<xs:enumeration value="overRight"/>
<xs:enumeration value="overUp"/>
<xs:enumeration value="overDown"/>
<xs:enumeration value="rectOut"/>
<xs:enumeration value="rectIn"/>
<xs:enumeration value="blindLeft"/>
<xs:enumeration value="blindRight"/>

<xs:enumeration value="blindUp"/>
<xs:enumeration value="blindDown"/>
<xs:enumeration value="cuttonHorzOut"/>
<xs:enumeration value="cuttonHorzIn"/>
<xs:enumeration value="cuttonVertOut"/>
<xs:enumeration value="cuttonVertIn"/>
<xs:enumeration value="moveLeft"/>
<xs:enumeration value="moveRight"/>
<xs:enumeration value="moveUp"/>
<xs:enumeration value="moveDown"/>
<xs:enumeration value="random"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="soundIDRef">
<xs:simpleType>
<xs:restriction base="xs:string"/>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="invertText" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation/>
<
/xs:annotation>
</xs:attribute>
<xs:attribute nS
ame="autoshow" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>
</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="showtime" type="xs:nonNegativeInteger"/>
<xs:attribute name="applyto">
<xs:annotation>
<xs:documentation>적용범위</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="WholeDoc"/>
<xs:enumeration value="NewSection"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
</xs:element>
</xs:sequence>
<xs:attribute name="id" type="xs:string" use="required"/>
<xs:attribute name="textDirection" use="optional" default="HORIZONTAL">
<xs:annotation>

<xs:documentation>텍스트 방향</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="HORIZONTAL"/>
<xs:enumeration value="VERTICAL"/>
<xs:enumeration value="VERTICALALL">
<xs:annotation>
<xs:documentation>세로 영문 세움</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="spaceColumns" type="xs:integer" default="0">
<xs:annotation>
<xs:documentation>동일한 페이지에서 서로 다른 단 사이의 간격</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="tabStopVal" type="xs:integer" default="0">
<xs:annotation>
<xs:documentation>기본 탭 간격</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="tT
abStopUS
nit" d-
efault="
HWPUNIT">
<xs:annotation>
<xs:documentation>기본 탭 간격 단위</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="CHAR"/>
<xs:enumeration value="HWPUNIT"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="outlineShapeIDRef" type="xs:nonNegativeInteger">
<xs:annotation>
<xs:documentation>개요 번호 모양 아이디 참조 값</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="memoShapeIDRef" type="xs:nonNegativeInteger">
<xs:annotation>
<xs:documentation>구역 내에서 사용되는 메모의 모양을 설정하기 위한 아이디 참조 값
                </xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="textVerticalWidthHead" type="xs:boolean" default="false">
<xs:annotation>

<xs:documentation>머리말/꼬리말 세로 쓰기 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="masterPageCnt" type="xs:nonNegativeInteger" default="0">
<xs:annotation>
<xs:documentation>확장 바탕쪽 개수</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
<xs:complexType name="NoteShapeType" abstract="true">
<xs:annotation>
<xs:documentation>각주/미주 모양 정보</xs:documentation>
</xs:annotation>
<xs:sequence>
<xs:element name="autoNumFormat" type="hp:AutoNumFormatType"/>
<xs:element name="noteLine">
<xs:complexType>
<xs:attribute name="length" type="xs:integer" default="0">
<xs:annotation>
<xs:documentation>구분선길이, 0 (구분선없음), -1 (5 cm), -2 (2 cm), -3 (단
크기의 1/3), -4 (단 크기), 그 외 (HWPUNIT 단위의 사용자 지정 길이)</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:atT
tribute nS
ame="-
type" tyM
pe="hc:LineO
Type2" deT
fault="SOLID">
<xs:annotation>
<xs:documentation>구분선종류.</xs:documentaItion>
</xs:annotation>
</xs:attribute>
<xs:attribute name="width" type="hc:LineWidth" default="0.12 mm">
<xs:annotation>
<xs:documentation>구분선굵기. 단위는 mm.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="color" type="hc:RGBColorType" default="#000000">
<xs:annotation>
<xs:documentation>구분선색.</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="noteSpacing">
<xs:complexType>
<xs:attribute name="betweenNotes" type="xs:nonNegativeInteger" default="850">
<xs:annotation>
<xs:documentation>주석 사이 여백</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="belowLine" type="xs:nonNegativeInteger" default="567">

<xs:annotation>
<xs:documentation>구분선아래 여백</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="aboveLine" type="xs:nonNegativeInteger" default="567">
<xs:annotation>
<xs:documentation>구분선위 여백</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
</xs:sequence>
</xs:complexType>
<xs:complexType name="FootNoteShapeType">
<xs:annotation>
<xs:documentation>각주 모양 정보</xs:documentation>
</xs:annotation>
<xs:complexContent>
<xs:extension base="hp:NoteShapeType">
<xs:sequence>
<xs:element name="numbering">
<xs:complexType>
<xs:attribute name="type" default="CONTINUOUS">
<xs:annotation>
<xs:documentation>번호 매기기 형식</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="CONTINUOUS">
<xs:annotation>
<xs:documentation>앞 구역에
이어서</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="ON_SECTION">
<xs:annotation>
<xs:documentation>현재 구역부터 새로 시작
                                               </xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="ON_PAGE">
<xs:annotation>
<xs:documentation>쪽마다 새로 시작. 각주 전용
                                                </xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>

</xs:attribute>
<xs:attribute name="newNum" type="xs:positiveInteger" default="1">
<xs:annotation>
<xs:documentation>시작 번호. type이 ON_SECTION일 때만
사용한다.
                                    </xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="placement">
<xs:complexType>
<xs:attribute name="place" default="EACH_COLUMN">
<xs:annotation>
<xs:documentation>한 페이지 내에서 각주를 다단에 어떻게
위치시킬지를 표시한다
                                    </xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="EACH_COLUMN">
<xs:annotation>
         KATS-M
<xs:d
ocumentation>각 단마다 따로
배열</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="MERGED_COLUMN">
<xs:annotation>
<xs:documentation>통단으로
배열</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="RIGHT_MOST_COLUMN">
<xs:annotation>
<xs:documentation>가장 오른쪽 단에
배열</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="beneathText" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>텍스트에 이어 바로 출력할지
여부</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>

</xs:element>
</xs:sequence>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="EndNoteShapeType">
<xs:annotation>
<xs:documentation>미주 모양 정보</xs:documentation>
</xs:annotation>
<xs:complexContent>
<xs:extension base="hp:NoteShapeType">
<xs:sequence>
<xs:element name="numbering">
<xs:complexType>
<xs:attribute name="type" default="CONTINUOUS">
<xs:annotation>
<xs:documentation>번호 매기기 형식</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="CONTINUOUS">
<xs:annotation>
<xs:documentation>앞 구역에
이어서</xs:documentaA
tion> TS-
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="ON_SECTION">
<xs:annotation>
<xs:documentation>현재 구역부터 새로 시작
                                                </xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="newNum" type="xs:positiveInteger" default="1">
<xs:annotation>
<xs:documentation>시작 번호. type이 ON_SECTION일 때만
사용한다.
                                    </xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="placement">
<xs:complexType>
<xs:attribute name="place" default="END_OF_DOCUMENT">
<xs:annotation>

<xs:documentation>한 페이지 내에서 미주를 다단에 어떻게
위치시킬지를 표시한다
                                    </xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="END_OF_DOCUMENT">
<xs:annotation>
<xs:documentation>문서의
마지막</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="END_OF_SECTION">
<xs:annotation>
<xs:documentation>구역의
마지막</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="beneathText" type="xs:boolean" default="false">
여부
</
xs:d
ocuK
mentatioA
n> TS
<xs:annotation>
<xs:documentation>텍스트에 이어 바로 출력할지
</xs:a-nnotatiMon>
</xs:attribute>
</xs:complexType>
</xs:element>
</xs:sequence>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="AutoNumFormatType">
<xs:attribute name="type" type="hc:NumberType2" default="DIGIT">
<xs:annotation>
<xs:documentation>번호 모양 종류</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="userChar" type="xs:string">
<xs:annotation>
<xs:documentation>사용자 기호</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="prefixChar" type="xs:string">
<xs:annotation>
<xs:documentation>앞 장식 문자</xs:documentation>
</xs:annotation>

</xs:attribute>
<xs:attribute name="suffixChar" type="xs:string" default=")">
<xs:annotation>
<xs:documentation>뒤 장식 문자</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="supscript" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>각주/미주 내용 중 번호 코드의 모양을 위첨자 형식으로 할지 여부
                </xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
<xs:simpleType name="VisibilityValue">
<xs:restriction base="xs:string">
<xs:enumeration value="HIDE_FIRST"/>
<xs:enumeration value="SHOW_FIRST"/>
<xs:enumeration value="SHOW_ALL"/>
</xs:restriction>
</xs:simpleType>
<xs:complexType name="ColumnDefType">
<xs:sequence>
<xs:element name="colLine" minOccurs="0">
<xs:annotation>
<xs:documentation>-
단 구분M
선</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="type" type="hc:LineType2" default="SOLID"/>
<xs:attribute name="width" type="hc:LineWidth" default="0.12 mm"/>
<xs:attribute name="color" type="hc:RGBColorType" default="#000000"/>
</xs:complexType>
</xs:element>
<xs:element name="colSz" minOccurs="0" maxOccurs="255">
<xs:annotation>
<xs:documentation>sameSize가 false일 때, 각 단의 크기 및 사이
간격.</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="width" type="xs:positiveInteger"/>
<xs:attribute name="gap" type="xs:nonNegativeInteger"/>
</xs:complexType>
</xs:element>
</xs:sequence>
<xs:attribute name="id" type="xs:string" use="required"/>
<xs:attribute name="type" default="NEWSPAPER">
<xs:annotation>
<xs:documentation>단 종류</xs:documentation>
</xs:annotation>

<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="NEWSPAPER"/>
<xs:enumeration value="BALANCED_NEWSPAPER"/>
<xs:enumeration value="PARALLEL"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="layout" default="LEFT">
<xs:annotation>
<xs:documentation>단 방향 지정</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="LEFT"/>
<xs:enumeration value="RIGHT"/>
<xs:enumeration value="MIRROR"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="colCount" default="1">
<xs:annotation>
<xs:documentation
</xs:annotation>
<xs:simpleType>
<xAs:restrictTion baseS
>단 개
수</xs:documentation>
="xs:positiveIMnteger">
<xs:maxInclusive value="255"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="sameSz" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>false: 단 너비 각지 지정.
true: 단 너비 동일.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="sameGap" type="xs:nonNegativeInteger" default="0">
<xs:annotation>
<xs:documentation>단 사이 간격.
sameSize가 true일 때만 지정.</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
<xs:complexType name="InsideMarginType">
<xs:attributeGroup ref="hc:MarginAttributeGroup"/>
</xs:complexType>
<xs:complexType name="LineShapeType">
<xs:attribute name="color" type="hc:RGBColorType"/>

<xs:attribute name="width" type="xs:nonNegativeInteger"/>
<xs:attribute name="style" type="hc:LineType2" default="SOLID"/>
<xs:attribute name="endCap" default="FLAT">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="ROUND"/>
<xs:enumeration value="FLAT"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="headStyle" type="hc:ArrowType" default="NORMAL"/>
<xs:attribute name="tailStyle" type="hc:ArrowType" default="NORMAL"/>
<xs:attribute name="headfill" type="xs:boolean" default="false"/>
<xs:attribute name="tailfill" type="xs:boolean" default="false"/>
<xs:attribute name="headSz" type="hc:ArrowSize" default="SMALL_SMALL"/>
<xs:attribute name="tailSz" type="hc:ArrowSize" default="SMALL_SMALL"/>
<xs:attribute name="outlineStyle" default="NORMAL">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="NORMAL"/>
<xs:enumeration value="OUTER"/>
<xs:enumeration value="INNER"/>
</x
s:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="aTlpha" tySpe="xs:float"/>
</xs:complexType>
<xs:complexType name="EffectsType">
<xs:sequence>
<xs:element name="shadow" minOccurs="0">
<xs:complexType>
<xs:sequence>
<xs:element name="skew" type="hp:SkewType">
<xs:annotation>
<xs:documentation>기울기 각도</xs:documentation>
</xs:annotation>
</xs:element>
<xs:element name="scale" type="hp:ScaleType">
<xs:annotation>
<xs:documentation>확대 비율</xs:documentation>
</xs:annotation>
</xs:element>
<xs:element name="effectsColor" type="hp:EffectsColorType"/>
</xs:sequence>
<xs:attribute name="style">
<xs:annotation>
<xs:documentation>그림자 스타일</xs:documentation>
</xs:annotation>

<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="OUTSIDE"/>
<xs:enumeration value="INSIDE"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="alpha">
<xs:annotation>
<xs:documentation>투명도</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:float">
<xs:minInclusive value="0"/>
<xs:maxInclusive value="1"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="radius" type="xs:float">
<xs:annotation>
<xs:documentation>흐릿한 정도. 단위는 HWPUNIT.</xs:documentation>
</xs:annotation>
</xs:a
<xs:at
<T
ttribute>
tribute name="direction">
xs:annotation>
<xs:Sdocum-entatioMn>그림자 방향 각도</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="0"/>
<xs:maxInclusive value="360"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="distance">
<xs:annotation>
<xs:documentation>거리. 단위는 HWPUNIT.</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:float">
<xs:minInclusive value="0"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="alignStyle" type="hc:AlignStyleType">
<xs:annotation>
<xs:documentation>그림자 표현 방식</xs:documentation>
</xs:annotation>

</xs:attribute>
<xs:attribute name="rotationStyle" type="xs:boolean">
<xs:annotation>
<xs:documentation>도형과 함께 그림자 회전 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="glow" minOccurs="0">
<xs:complexType>
<xs:sequence>
<xs:element name="effectsColor" type="hp:GlowEffectsColorType"/>
</xs:sequence>
<xs:attribute name="alpha">
<xs:annotation>
<xs:documentation>투명도</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:float">
<xs:minInclusive value="0"/>
<xs:maxInclusive value="1"/>
</xs:restriction>
</xs:a
<xs:atT
/xs:simp
ttribute>
tribute nS
leType>
ame="-
radius"
type="xs:float">
<xs:annotation>
<xs:documentation>네온 크기. 단위는 HWPUNIT.</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="softEdge" minOccurs="0">
<xs:complexType>
<xs:attribute name="radius" type="xs:float">
<xs:annotation>
<xs:documentation>부드러운 가장자리 크기. 단위는
HWPUNIT.</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="reflection" minOccurs="0">
<xs:complexType>
<xs:sequence>
<xs:element name="skew" type="hp:SkewType"/>
<xs:element name="scale" type="hp:ScaleType"/>
<xs:element name="alpha">
<xs:complexType>

<xs:attribute name="start">
<xs:annotation>
<xs:documentation>시작 위치 투명도</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:float">
<xs:minInclusive value="0"/>
<xs:maxInclusive value="1"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="end">
<xs:annotation>
<xs:documentation>끝 위치 투명도</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:float">
<xs:minInclusive value="0"/>
<xs:maxInclusive value="1"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="pos">
<xs:Scompl-exType>
<xs:attribute name="start" type="xs:float">
<xs:annotation>
<xs:documentation>시작 위치</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="end" type="xs:float">
<xs:annotation>
<xs:documentation>끝 위치</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
</xs:sequence>
<xs:attribute name="alignStyle" type="hc:AlignStyleType"/>
<xs:attribute name="radius" type="xs:float">
<xs:annotation>
<xs:documentation>흐릿한 정도. 단위는 HWPUNIT.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="direction">
<xs:annotation>
<xs:documentation>그림자 방향 각도</xs:documentation>

</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="0"/>
<xs:maxInclusive value="360"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="distance">
<xs:annotation>
<xs:documentation>거리. 단위는 HWPUNIT.</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:float">
<xs:minInclusive value="0"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="rotationStyle" type="xs:boolean">
<xs:annotation>
<xs:documentation>도형과 함께 회전 여부</xs:documentation>
</xs:annotation>
</xs:a
<xs:atT
ttribute>
tribute nS
ame="
<xs:annotation>
<xs:docum-
fadeDirM
ection">
entation>오프셋 방O향</xs:doTcumentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="0"/>
<xs:maxInclusive value="360"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
</xs:element>
</xs:sequence>
</xs:complexType>
<xs:complexType name="EffectsColorType">
<xs:sequence>
<xs:choice>
<xs:element name="rgb">
<xs:complexType>
<xs:attribute name="r" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="g" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="b" type="xs:nonNegativeInteger" use="required"/>
</xs:complexType>
</xs:element>

<xs:element name="cmyk">
<xs:complexType>
<xs:attribute name="c" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="m" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="y" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="k" type="xs:nonNegativeInteger" use="required"/>
</xs:complexType>
</xs:element>
<xs:element name="scheme">
<xs:complexType>
<xs:attribute name="r" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="g" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="b" type="xs:nonNegativeInteger" use="required"/>
</xs:complexType>
</xs:element>
<xs:element name="system">
<xs:complexType>
<xs:attribute name="h" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="s" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="l" type="xs:nonNegativeInteger" use="required"/>
</xs:complexType>
</xs:element>
</xs:choice>
</xs:sequence>
<xs:attributeA
 name="tT
ype" useS
="req-
uired">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="RGB"/>
<xs:enumeration value="CMYK"/>
<xs:enumeration value="SCHEME"/>
<xs:enumeration value="SYSTEM"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="schemeIdx" type="xs:integer"/>
<xs:attribute name="systemIdx" type="xs:integer"/>
<xs:attribute name="presetIdx" type="xs:integer"/>
</xs:complexType>
<xs:complexType name="GlowEffectsColorType">
<xs:complexContent>
<xs:extension base="hp:EffectsColorType">
<xs:sequence>
<xs:element name="effect" minOccurs="0">
<xs:complexType>
<xs:attribute name="type" use="required">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="ALPHA"/>

<xs:enumeration value="ALPHA_MOD"/>
<xs:enumeration value="ALPHA_OFF"/>
<xs:enumeration value="RED"/>
<xs:enumeration value="RED_MOD"/>
<xs:enumeration value="RED_OFF"/>
<xs:enumeration value="GREEN"/>
<xs:enumeration value="GREEN_MOD"/>
<xs:enumeration value="GREEN_OFF"/>
<xs:enumeration value="BLUE"/>
<xs:enumeration value="BLUE_MOD"/>
<xs:enumeration value="BLUE_OFF"/>
<xs:enumeration value="HUE"/>
<xs:enumeration value="HUE_MOD"/>
<xs:enumeration value="HUE_OFF"/>
<xs:enumeration value="SAT"/>
<xs:enumeration value="SAT_MOD"/>
<xs:enumeration value="SAT_OFF"/>
<xs:enumeration value="LUM"/>
<xs:enumeration value="LUM_MOD"/>
<xs:enumeration value="LUM_OFF"/>
<xs:enumeration value="SHADE"/>
<xs:enumeration value="TINT"/>
<xs:enumeration value="GRAY"/>
<xs:enumeration value="COMP"/>
<xs:enumeration value="GAMMA"/>
<xs:enumeration value="
활용IMMAE"/>
을 금지합니다.
<xs:enumeration value="INV"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="value" type="xs:string" use="required"/>
</xs:complexType>
</xs:element>
</xs:sequence>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="SkewType">
<xs:attribute name="x">
<xs:simpleType>
<xs:restriction base="xs:float">
<xs:minInclusive value="-90"/>
<xs:maxInclusive value="90"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="y">
<xs:simpleType>

<xs:restriction base="xs:float">
<xs:minInclusive value="-90"/>
<xs:maxInclusive value="90"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
<xs:complexType name="ScaleType">
<xs:attribute name="x" type="xs:float"/>
<xs:attribute name="y" type="xs:float"/>
</xs:complexType>
<xs:complexType name="ShadowType">
<xs:annotation>
<xs:documentation>그림자 속성</xs:documentation>
</xs:annotation>
<xs:attribute name="type" default="NONE">
<xs:annotation>
<xs:documentation>그림자 종류</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="NONE"/>
<xs:enumeration val
<xs:enumeration val<xs:enumeration val
<xs:enumeration val-
ue="PARELLEL_LEFTTOP"/>
ue="PARELLEL_RIGO
HTTOP"/>
ue="PARELLEL_LEFTBOTTOM"/>
ue="PARELLEL_RIGHTBOTTTOM"/>
<xs:enumeration value="SHEAR_LEFTTOP"/>
<xs:enumeration value="SHEAR_RIGHTTOP"/>
<xs:enumeration value="SHEAR_LEFTBOTTOM"/>
<xs:enumeration value="SHEAR_RIGHTBOTTOM"/>
<xs:enumeration value="PERS_LEFTTOP"/>
<xs:enumeration value="PERS_RIGHTTOP"/>
<xs:enumeration value="PERS_LEFTBOTTOM"/>
<xs:enumeration value="PERS_RIGHTBOTTOM"/>
<xs:enumeration value="SCALE_NARROW"/>
<xs:enumeration value="SCALE_ENLARGE"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="color" type="hc:RGBColorType" default="#000000">
<xs:annotation>
<xs:documentation>그림자 색</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="offsetX">
<xs:annotation>
<xs:documentation>그림자 간격 X</xs:documentation>
</xs:annotation>

<xs:simpleType>
<xs:restriction base="xs:integer"/>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="offsetY">
<xs:annotation>
<xs:documentation>그림자 간격 Y</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:integer"/>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="alpha" type="xs:float"/>
</xs:complexType>
<xs:complexType name="AbstractShapeObjectType" abstract="true">
<xs:sequence>
<xs:element name="sz" minOccurs="0">
<xs:complexType>
<xs:attribute name="width" type="xs:nonNegativeInteger"/>
<xs:attribute name="widthRelTo" default="ABSOLUTE">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration valM
tion value="PAPER"/>
tion value="PAGE"/>
tion value="COLUMN"/>
<xs:enumeration value="PARA"/>
<xs:enumeration value="ABSOLUTE"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="height" type="xs:nonNegativeInteger"/>
<xs:attribute name="heightRelTo" default="ABSOLUTE">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="PAPER"/>
<xs:enumeration value="PAGE"/>
<xs:enumeration value="ABSOLUTE"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="protect" type="xs:boolean" default="false"/>
</xs:complexType>
</xs:element>
<xs:element name="pos" minOccurs="0">
<xs:complexType>
<xs:attribute name="treatAsChar" type="xs:boolean" default="false"/>
<xs:attribute name="affectLSpacing" type="xs:boolean" default="false"/>
<xs:attribute name="flowWithText" type="xs:boolean" default="false"/>

<xs:attribute name="allowOverlap" type="xs:boolean" default="false"/>
<xs:attribute name="holdAnchorAndSO" type="xs:boolean" default="false"/>
<xs:attribute name="vertRelTo">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="PAPER"/>
<xs:enumeration value="PAGE"/>
<xs:enumeration value="PARA"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="horzRelTo">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="PAPER"/>
<xs:enumeration value="PAGE"/>
<xs:enumeration value="COLUMN"/>
<xs:enumeration value="PARA"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="vertAlign">
<
xs:simpleType>
<xs:S
restric-
tion bas
<xs:enumeraM
e="xs:stringO
">
tion value="TOP"/>
<xs:enumeration value="CENTER"/>
<xs:enumeration value="BOTTOM"/>
<xs:enumeration value="INSIDE"/>
<xs:enumeration value="OUTSIDE"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="horzAlign">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="LEFT"/>
<xs:enumeration value="CENTER"/>
<xs:enumeration value="RIGHT"/>
<xs:enumeration value="INSIDE"/>
<xs:enumeration value="OUTSIDE"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="vertOffset" type="xs:nonNegativeInteger" default="0"/>
<xs:attribute name="horzOffset" type="xs:nonNegativeInteger" default="0"/>
</xs:complexType>
</xs:element>
<xs:element name="outMargin" minOccurs="0">

<xs:complexType>
<xs:attributeGroup ref="hc:MarginAttributeGroup"/>
</xs:complexType>
</xs:element>
<xs:element name="caption" minOccurs="0">
<xs:complexType>
<xs:sequence>
<xs:element name="subList" type="hp:ParaListType"/>
</xs:sequence>
<xs:attribute name="side" default="LEFT">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="LEFT"/>
<xs:enumeration value="RIGHT"/>
<xs:enumeration value="TOP"/>
<xs:enumeration value="BOTTOM"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="fullSz" type="xs:boolean" default="false"/>
<xs:attribute name="width" type="xs:integer"/>
<xs:attribute name="gap" type="xs:integer" default="850"/>
</x
</xs:ele
<xs:eleA
<xs:at
tribute name="lastWidth" type="xs:nonNegativeInteger"/>
s:complexType>
ment>
ment name="shapeComment" minOccurs="0"/>
<xs:element name="metaTag" type="hc:MetaTagType" minOccurs="0"/>
</xs:sequence>
<xs:attribute name="id" type="xs:nonNegativeInteger"/>
<xs:attribute name="zOrder" type="xs:integer" default="0"/>
<xs:attribute name="numberingType" default="NONE">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="NONE"/>
<xs:enumeration value="PICTURE"/>
<xs:enumeration value="TABLE"/>
<xs:enumeration value="EQUATION"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="textWrap">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="SQUARE"/>
<xs:enumeration value="TIGHT"/>
<xs:enumeration value="THROUGH"/>
<xs:enumeration value="TOP_AND_BOTTOM"/>
<xs:enumeration value="BEHIND_TEXT"/>

<xs:enumeration value="IN_FRONT_OF_TEXT"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="textFlow" default="BOTH_SIDES">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="BOTH_SIDES"/>
<xs:enumeration value="LEFT_ONLY"/>
<xs:enumeration value="RIGHT_ONLY"/>
<xs:enumeration value="LARGEST_ONLY"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="lock" type="xs:boolean" default="false"/>
<xs:attribute name="dropcapstyle" type="hc:DropCapStyleType" default="None"/>
</xs:complexType>
<xs:complexType name="TableType">
<xs:complexContent>
<xs:extension base="hp:AbstractShapeObjectType">
<xs:sequence>
<xs:element name="inMargin" type="hp:InsideMarginType"/>
<xs:el
ement n
ame="cellzoneList" minOccurs="0">
<xs:complexType>
<xs:sequence>
<xs:element name="cellzone" maxOccurs="unbounded">
<xs:complexType>
<xs:attribute name="startRowAddr"
type="xs:nonNegativeInteger">
<xs:annotation>
<xs:documentation>셀존 Row의 시작
주소</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="startColAddr"
type="xs:nonNegativeInteger">
<xs:annotation>
<xs:documentation>셀존 Column의 시작
주소</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="endRowAddr"
type="xs:nonNegativeInteger">
<xs:annotation>
<xs:documentation>셀존 Row의 끝
주소</xs:documentation>
</xs:annotation>
</xs:attribute>

<xs:attribute name="endColAddr"
type="xs:nonNegativeInteger">
<xs:annotation>
<xs:documentation>셀존 Column의 끝 주소
                                                </xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="borderFillIDRef"
type="xs:nonNegativeInteger">
<xs:annotation>
<xs:documentation>테두리/배경 아이디 참조 값
                                                </xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
</xs:sequence>
</xs:complexType>
</xs:element>
<xs:element name="tr" maxOccurs="unbounded">
<xs:complexType>
<xs:sequence>
<xs:element name="tc" maxOccurs="unbounded">
<xs:complexType>
<xs:sequence>
<xs:element name="subList" type="hp:ParaListType"/>
<xs:element name="cellAddr">
<xs:complexType>
<xs:attribute name="colAddr"
type="xs:nonNegativeInteger"/>
<xs:attribute name="rowAddr"
type="xs:nonNegativeInteger"/>
</xs:complexType>
</xs:element>
<xs:element name="cellSpan">
<xs:complexType>
<xs:attribute name="colSpan"
type="xs:positiveInteger" default="1"/>
<xs:attribute name="rowSpan"
type="xs:positiveInteger" default="1"/>
</xs:complexType>
</xs:element>
<xs:element name="cellSz">
<xs:complexType>
<xs:attribute name="width"
type="xs:nonNegativeInteger"/>
<xs:attribute name="height"
type="xs:nonNegativeInteger"/>

</xs:complexType>
</xs:element>
<xs:element name="cellMargin">
<xs:complexType>
<xs:attributeGroup
ref="hc:MarginAttributeGroup"/>
</xs:complexType>
</xs:element>
</xs:sequence>
<xs:attribute name="name" type="xs:string"/>
<xs:attribute name="header" type="xs:boolean" default="false"/>
<xs:attribute name="hasMargin" type="xs:boolean"
default="false"/>
<xs:attribute name="protect" type="xs:boolean" default="false"/>
<xs:attribute name="editable" type="xs:boolean"
default="false"/>
<xs:attribute name="dirty" type="xs:boolean" default="false"/>
<xs:attribute name="borderFillIDRef"
type="xs:nonNegativeInteger"/>
</xs:complexType>
</xs:element>
</xs:sequence>
<
/xs:complexType>
</xs:element>
<xs:element name="label" mM
inOccurs="0">
<xs:complexType>
<xs:attribute name="topmargin" type="xs:nonNegativeInteger"/>
<xs:attribute name="leftmargin" type="xs:nonNegativeInteger"/>
<xs:attribute name="boxwidth" type="xs:nonNegativeInteger"/>
<xs:attribute name="boxlength" type="xs:nonNegativeInteger"/>
<xs:attribute name="boxmarginhor" type="xs:nonNegativeInteger"/>
<xs:attribute name="boxmarginver" type="xs:nonNegativeInteger"/>
<xs:attribute name="labelcols" type="xs:nonNegativeInteger"/>
<xs:attribute name="labelrows" type="xs:nonNegativeInteger"/>
<xs:attribute name="landscape">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="WIDELY"/>
<xs:enumeration value="NARROWLY"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="pagewidth" type="xs:nonNegativeInteger"/>
<xs:attribute name="pageheight" type="xs:nonNegativeInteger"/>
</xs:complexType>
</xs:element>
</xs:sequence>
<xs:attribute name="pageBreak" default="CELL">

<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="TABLE"/>
<xs:enumeration value="CELL"/>
<xs:enumeration value="NONE"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="repeatHeader" type="xs:boolean" default="false"/>
<xs:attribute name="noAdjust" type="xs:boolean" default="false"/>
<xs:attribute name="rowCnt" type="xs:positiveInteger"/>
<xs:attribute name="colCnt" type="xs:positiveInteger"/>
<xs:attribute name="cellSpacing" type="xs:nonNegativeInteger" default="0"/>
<xs:attribute name="borderFillIDRef" type="xs:nonNegativeInteger"/>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="EquationType">
<xs:complexContent>
<xs:extension base="hp:AbstractShapeObjectType">
<xs:sequence>
<xs:element name="script"/>
</x
s:sequence>
<xs:attributT
e name="version" type="xs:string" default="Equation Version 60">
<xs:annotation>
<xs:documentation>수식 버전.
현재 버전은 "Equation Version 60"</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="baseLine" default="85">
<xs:annotation>
<xs:documentation>수식이 그려질 기본 선.</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:unsignedInt">
<xs:maxInclusive value="100"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="textColor" type="hc:RGBColorType" default="#000000">
<xs:annotation>
<xs:documentation>수식 글자 색</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="baseUnit" type="xs:nonNegativeInteger" default="1000">
<xs:annotation>
<xs:documentation>수식의 글자 크기. 단위는 HWPUNIT.</xs:documentation>
</xs:annotation>

</xs:attribute>
<xs:attribute name="lineMode" default="CHAR">
<xs:annotation>
<xs:documentation>수식이 차지하는 범위.</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="LINE"/>
<xs:enumeration value="CHAR"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="font" default="HYhwpEQ">
<xs:annotation>
<xs:documentation/>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string"/>
</xs:simpleType>
</xs:attribute>
</xs:extension>
</xs:complexContent>
<
/xs:c
om
plexType
>
<xs:complexType name="AbstractShapeComponentType" abstract="true">
<xs:complexContent>
<xs:extension base="hp:AbstractShapeObjectType">
<xs:sequence>
<xs:element name="offset">
<xs:complexType>
<xs:attribute name="x" type="xs:nonNegativeInteger" default="0"/>
<xs:attribute name="y" type="xs:nonNegativeInteger" default="0"/>
</xs:complexType>
</xs:element>
<xs:element name="orgSz">
<xs:complexType>
<xs:attribute name="width" type="xs:nonNegativeInteger"/>
<xs:attribute name="height" type="xs:nonNegativeInteger"/>
</xs:complexType>
</xs:element>
<xs:element name="curSz">
<xs:complexType>
<xs:attribute name="width" type="xs:nonNegativeInteger"/>
<xs:attribute name="height" type="xs:nonNegativeInteger"/>
</xs:complexType>
</xs:element>
<xs:element name="flip">
<xs:complexType>
<xs:attribute name="horizontal" type="xs:boolean" default="false"/>

<xs:attribute name="vertical" type="xs:boolean" default="false"/>
</xs:complexType>
</xs:element>
<xs:element name="rotationInfo">
<xs:complexType>
<xs:attribute name="angle" type="xs:integer" default="0"/>
<xs:attribute name="centerX" type="xs:nonNegativeInteger"/>
<xs:attribute name="centerY" type="xs:nonNegativeInteger"/>
<xs:attribute name="rotateimage" type="xs:boolean"/>
</xs:complexType>
</xs:element>
<xs:element name="renderingInfo">
<xs:complexType>
<xs:sequence>
<xs:element name="transMatrix" type="hc:MatrixType"/>
<xs:sequence minOccurs="0" maxOccurs="unbounded">
<xs:element name="scaMatrix" type="hc:MatrixType"/>
<xs:element name="rotMatrix" type="hc:MatrixType"/>
</xs:sequence>
</xs:sequence>
</xs:complexType>
</xs:element>
</x
<x
<xA
s:sequen
s:attributT
ce>
e name="href" type="xs:string"/>
s:attribute name=S
"grou-
pLevel"
type="xs:nonNegativeInteger" default="0"/>
<xs:attribute name="instid" type="xs:nonNegativeInteger"/>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="PictureType">
<xs:complexContent>
<xs:extension base="hp:AbstractShapeComponentType">
<xs:sequence>
<xs:element name="lineShape" type="hp:LineShapeType" minOccurs="0"/>
<xs:element name="imgRect">
<xs:complexType>
<xs:sequence>
<xs:element name="pt0" type="hc:PointType"/>
<xs:element name="pt1" type="hc:PointType"/>
<xs:element name="pt2" type="hc:PointType"/>
<xs:element name="pt3" type="hc:PointType"/>
</xs:sequence>
</xs:complexType>
</xs:element>
<xs:element name="imgClip">
<xs:complexType>
<xs:attribute name="left" type="xs:integer"/>
<xs:attribute name="right" type="xs:integer"/>

<xs:attribute name="top" type="xs:integer"/>
<xs:attribute name="bottom" type="xs:integer"/>
</xs:complexType>
</xs:element>
<xs:element name="effects" type="hp:EffectsType"/>
<xs:element name="inMargin" type="hp:InsideMarginType"/>
<xs:element name="imgDim">
<xs:complexType>
<xs:attribute name="dimwidth" type="xs:unsignedInt"/>
<xs:attribute name="dimheight" type="xs:unsignedInt"/>
</xs:complexType>
</xs:element>
<xs:element name="img" type="hc:ImageType"/>
</xs:sequence>
<xs:attribute name="reverse" type="xs:boolean"/>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="OLEType">
<xs:complexContent>
<xs:extension base="hp:AbstractShapeComponentType">
<xs:sequence>
<xs:element name="
<xs:element name="extent" type="hc:PointType"/>
lineShaM
pe" type="hp:LineShapeType"/>
</xs:sequence>
<xs:attribute name="objectType">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="UNKNOWN"/>
<xs:enumeration value="EMBEDDED"/>
<xs:enumeration value="LINK"/>
<xs:enumeration value="STATIC"/>
<xs:enumeration value="EQUATION"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="binaryItemIDRef" type="xs:string"/>
<xs:attribute name="hasMoniker" type="xs:boolean" default="false"/>
<xs:attribute name="drawAspect">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="CONTENT"/>
<xs:enumeration value="THUMB_NAIL"/>
<xs:enumeration value="ICON"/>
<xs:enumeration value="DOC_PRINT"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>

<xs:attribute name="eqBaseLine" default="85">
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="0"/>
<xs:maxInclusive value="100"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="AbstractDrawingObjectType" abstract="true">
<xs:complexContent>
<xs:extension base="hp:AbstractShapeComponentType">
<xs:sequence>
<xs:element name="lineShape" type="hp:LineShapeType"/>
<xs:element name="fillBrush" type="hh:fillBrushType" minOccurs="0"/>
<xs:element name="drawText" minOccurs="0">
<xs:complexType>
<xs:sequence>
<xs:element name="subList" type="hp:ParaListType"/>
<xs:element name="textMargin" minOccurs="0">
<xs:complexType>
<xs:attributeGroup ref="hT
c:MarginI
AttributeGroup"/>
</xs:complexType>
</xs:element>
</xs:sequence>
<xs:attribute name="lastWidth" type="xs:nonNegativeInteger"/>
<xs:attribute name="name" type="xs:string"/>
<xs:attribute name="editable" type="xs:boolean" default="false"/>
</xs:complexType>
</xs:element>
<xs:element name="shadow" type="hp:ShadowType" minOccurs="0"/>
</xs:sequence>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="LineType">
<xs:complexContent>
<xs:extension base="hp:AbstractDrawingObjectType">
<xs:sequence>
<xs:element name="startPt" type="hc:PointType"/>
<xs:element name="endPt" type="hc:PointType"/>
</xs:sequence>
<xs:attribute name="isReverseHV" type="xs:boolean" default="false"/>
</xs:extension>
</xs:complexContent>
</xs:complexType>

<xs:complexType name="RectangleType">
<xs:complexContent>
<xs:extension base="hp:AbstractDrawingObjectType">
<xs:sequence>
<xs:element name="pt0" type="hc:PointType"/>
<xs:element name="pt1" type="hc:PointType"/>
<xs:element name="pt2" type="hc:PointType"/>
<xs:element name="pt3" type="hc:PointType"/>
</xs:sequence>
<xs:attribute name="ratio" type="xs:nonNegativeInteger"/>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="EllipseType">
<xs:complexContent>
<xs:extension base="hp:AbstractDrawingObjectType">
<xs:sequence>
<xs:element name="center" type="hc:PointType"/>
<xs:element name="ax1" type="hc:PointType"/>
<xs:element name="ax2" type="hc:PointType"/>
<xs:element name="start1" type="hc:PointType"/>
<xs:element name="end1" type="hc:PointType"/>
<xs:element name="start2" type="hc:PointType"/>
<xs:element name="end2" tyM
pe="hc:PointType"/>
</xs:sequence>
<xs:attribute name="intervalDirty" type="xs:boolean" default="false"/>
<xs:attribute name="hasArcPr" type="xs:boolean" default="false"/>
<xs:attribute name="arcType" default="NORMAL">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="NORMAL"/>
<xs:enumeration value="PIE"/>
<xs:enumeration value="CHORD"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="ArcType">
<xs:complexContent>
<xs:extension base="hp:AbstractDrawingObjectType">
<xs:sequence>
<xs:element name="center" type="hc:PointType"/>
<xs:element name="ax1" type="hc:PointType"/>
<xs:element name="ax2" type="hc:PointType"/>
</xs:sequence>
<xs:attribute name="type" default="NORMAL">

<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="NORMAL"/>
<xs:enumeration value="PIE"/>
<xs:enumeration value="CHORD"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="UnknownObjectType">
<xs:complexContent>
<xs:extension base="hp:AbstractDrawingObjectType">
<xs:sequence>
<xs:element name="Point0" type="hc:PointType"/>
<xs:element name="Point1" type="hc:PointType"/>
<xs:element name="Point2" type="hc:PointType"/>
<xs:element name="Point3" type="hc:PointType"/>
</xs:sequence>
<xs:attribute name="ctrlID" type="xs:string"/>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="PolygonType">
<xs:complexContent>
<xs:extension base="hp:AbstractDrawingObjectType">
<xs:sequence>
<xs:element name="pt" type="hc:PointType" maxOccurs="unbounded"/>
</xs:sequence>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="CurveType">
<xs:complexContent>
<xs:extension base="hp:AbstractDrawingObjectType">
<xs:sequence>
<xs:element name="seg" maxOccurs="unbounded">
<xs:complexType>
<xs:attribute name="type" default="CURVE">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="LINE"/>
<xs:enumeration value="CURVE"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="x1" type="xs:integer"/>

<xs:attribute name="y1" type="xs:integer"/>
<xs:attribute name="x2" type="xs:integer"/>
<xs:attribute name="y2" type="xs:integer"/>
</xs:complexType>
</xs:element>
</xs:sequence>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="ConnectLineType">
<xs:complexContent>
<xs:extension base="hp:AbstractDrawingObjectType">
<xs:sequence>
<xs:element name="startPt" type="hp:ConnectPointType"/>
<xs:element name="endPt" type="hp:ConnectPointType"/>
<xs:element name="controlPoints" minOccurs="0">
<xs:complexType>
<xs:sequence>
<xs:element name="point" type="hp:ConnectControlPointType"
maxOccurs="unbounded"/>
</xs:sequence>
</xs:complexType>
</xs:element>
</xs:sequence>
<xs:attribute name="type">
<xs:annotation>
<xs:documentation>연결선형식</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="STRAIGHT_NOARROW"/>
<xs:enumeration value="STRAIGHT_ONEWAY"/>
<xs:enumeration value="STRAIGHT_BOTH"/>
<xs:enumeration value="STROKE_NOARROW"/>
<xs:enumeration value="STROKE_ONEWAY"/>
<xs:enumeration value="STROKE_BOTH"/>
<xs:enumeration value="ARC_NOARROW"/>
<xs:enumeration value="ARC_ONEWAY"/>
<xs:enumeration value="ARC_BOTH"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="ConnectControlPointType">
<xs:complexContent>
<xs:extension base="hc:PointType">

<xs:attribute name="type" type="xs:nonNegativeInteger"/>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="ConnectPointType">
<xs:complexContent>
<xs:extension base="hc:PointType">
<xs:attribute name="subjectIDRef" type="xs:nonNegativeInteger"/>
<xs:attribute name="subjectIdx" type="xs:nonNegativeInteger"/>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="ContainerType">
<xs:complexContent>
<xs:extension base="hp:AbstractShapeComponentType">
<xs:sequence maxOccurs="unbounded">
<xs:element name="container" type="hp:ContainerType" minOccurs="0"/>
<xs:element name="line" type="hp:LineType" minOccurs="0"/>
<xs:element name="rect" type="hp:RectangleType" minOccurs="0"/>
<xs:element name="ellipse" type="hp:EllipseType" minOccurs="0"/>
<xs:element name="arc" type="hp:ArcType" minOccurs="0"/>
<xs:element name="polygon" type="hp:PolygonType" minOccurs="0"/>
<xs:element name="curve" t
<xs:element name="connecM
ype="hp:Cur
tLine" type="
veType" minOccurs="0"/>
hp:ConneT
ctLineTyI
pe"
 minOccurs="0"/>
<xs:element name="pic" type="hp:PictureType" minOccurs="0"/>
<xs:element name="ole" type="hp:OLEType" minOccurs="0"/>
</xs:sequence>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="AbstractFormObjectType" abstract="true">
<xs:complexContent>
<xs:extension base="hp:AbstractShapeObjectType">
<xs:sequence>
<xs:element name="formCharPr">
<xs:complexType>
<xs:attribute name="charPrIDRef" type="xs:nonNegativeInteger"/>
<xs:attribute name="followContext" type="xs:boolean" default="false"/>
<xs:attribute name="autoSz" type="xs:boolean" default="false"/>
<xs:attribute name="wordWrap" type="xs:boolean" default="false"/>
</xs:complexType>
</xs:element>
</xs:sequence>
<xs:attribute name="name" type="xs:string"/>
<xs:attribute name="foreColor" type="hc:RGBColorType"/>
<xs:attribute name="backColor" type="hc:RGBColorType"/>
<xs:attribute name="groupName" type="xs:string"/>
<xs:attribute name="tabStop" type="xs:boolean" default="true"/>

<xs:attribute name="editable" type="xs:boolean" default="true"/>
<xs:attribute name="tabOrder" type="xs:integer"/>
<xs:attribute name="enabled" type="xs:boolean" default="true"/>
<xs:attribute name="borderTypeIDRef" type="xs:nonNegativeInteger"/>
<xs:attribute name="drawFrame" type="xs:boolean" default="true"/>
<xs:attribute name="printable" type="xs:boolean" default="true"/>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="AbstractButtonObjectType">
<xs:complexContent>
<xs:extension base="hp:AbstractFormObjectType">
<xs:attribute name="caption" type="xs:string"/>
<xs:attribute name="value">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="UNCHECKED"/>
<xs:enumeration value="CHECKED"/>
<xs:enumeration value="INDETERMINATE"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<x
s:attribut
e name="radio
GroupN
ame" type="
xs:string"/>
<xs:attribute name="triState" type="xs:boolean" default="false"/>
<xs:attribute name="backStyle">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="TRANSPARENT"/>
<xs:enumeration value="OPAQUE"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="ComboBoxType">
<xs:complexContent>
<xs:extension base="hp:AbstractFormObjectType">
<xs:sequence>
<xs:element name="listItem" type="hp:ListItemType" minOccurs="0"
maxOccurs="unbounded"/>
</xs:sequence>
<xs:attribute name="listBoxRows" type="xs:integer"/>
<xs:attribute name="listBoxWidth" type="xs:integer"/>
<xs:attribute name="editEnable" type="xs:boolean" default="false"/>
<xs:attribute name="selectedValue" type="xs:string"/>
</xs:extension>
</xs:complexContent>

</xs:complexType>
<xs:complexType name="EditType">
<xs:complexContent>
<xs:extension base="hp:AbstractFormObjectType">
<xs:sequence>
<xs:element name="text"/>
</xs:sequence>
<xs:attribute name="multiLine" type="xs:boolean" default="false"/>
<xs:attribute name="passwordChar" type="xs:string" default="*"/>
<xs:attribute name="maxLength" type="xs:positiveInteger"/>
<xs:attribute name="scrollBars" default="NONE">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="NONE"/>
<xs:enumeration value="VERTICAL"/>
<xs:enumeration value="HORIZONTAL"/>
<xs:enumeration value="BOTH"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="tabKeyBehavior">
<xs:simpleType>
<
xs:restri
ction b
<xs:enume-
ase="xs
:string">
ration value="NEXTO
_OBJECT"/>
<xs:enumeration value="INSERT_TAB"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="numOnly" type="xs:boolean" default="false"/>
<xs:attribute name="readOnly" type="xs:boolean" default="false"/>
<xs:attribute name="alignText" default="LEFT">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="LEFT"/>
<xs:enumeration value="CENTER"/>
<xs:enumeration value="RIGHT"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="ListBoxType">
<xs:complexContent>
<xs:extension base="hp:AbstractFormObjectType">
<xs:sequence>
<xs:element name="listItem" type="hp:ListItemType" minOccurs="0"
maxOccurs="unbounded"/>

</xs:sequence>
<xs:attribute name="itemHeight" type="xs:integer"/>
<xs:attribute name="topIdx" type="xs:nonNegativeInteger"/>
<xs:attribute name="selectedValue" type="xs:string"/>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:complexType name="ScrollBarType">
<xs:complexContent>
<xs:extension base="hp:AbstractFormObjectType">
<xs:attribute name="delay" type="xs:nonNegativeInteger"/>
<xs:attribute name="largeChange" type="xs:nonNegativeInteger"/>
<xs:attribute name="smallChange" type="xs:nonNegativeInteger"/>
<xs:attribute name="min" type="xs:int"/>
<xs:attribute name="max" type="xs:int"/>
<xs:attribute name="page" type="xs:int"/>
<xs:attribute name="value" type="xs:int"/>
<xs:attribute name="type">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="HORIZONTAL"/>
<xs:enumeration value="VERTICAL"/>
<
/xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:extension>
</xs:complexContent>
</xs:complexType>
<xs:simpleType name="FieldType">
<xs:restriction base="xs:string">
<xs:enumeration value="CLICK_HERE"/>
<xs:enumeration value="HYPERLINK"/>
<xs:enumeration value="BOOKMARK"/>
<xs:enumeration value="FORMULA"/>
<xs:enumeration value="SUMMERY"/>
<xs:enumeration value="USER_INFO"/>
<xs:enumeration value="DATE"/>
<xs:enumeration value="DOC_DATE"/>
<xs:enumeration value="PATH"/>
<xs:enumeration value="CROSSREF"/>
<xs:enumeration value="MAILMERGE"/>
<xs:enumeration value="MEMO"/>
<xs:enumeration value="PROOFREADING_MARKS"/>
<xs:enumeration value="PRIVATE_INFO"/>
<xs:enumeration value="METATAG"/>
</xs:restriction>
</xs:simpleType>
<xs:complexType name="HeaderFooterType">

<xs:sequence>
<xs:element name="subList" type="hp:ParaListType"/>
</xs:sequence>
<xs:attribute name="id" type="xs:nonNegativeInteger"/>
<xs:attribute name="applyPageType" default="BOTH">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="BOTH"/>
<xs:enumeration value="EVEN"/>
<xs:enumeration value="ODD"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
<xs:complexType name="NoteType">
<xs:sequence>
<xs:element name="subList" type="hp:ParaListType"/>
</xs:sequence>
<xs:attribute name="instId" type="xs:nonNegativeInteger"/>
</xs:complexType>
<xs:complexType name="AutoNumNewNumType">
<xs:sequence>
<xs:elem
</xs:sequenc
<xsK
:attributeA
ent nam
e>
 name="nT
e="auto
NumFormat" type="hp:AutoNumFormatType"/>
um" type="xs-
:integer"
 default="1"
/>
<xs:attribute name="numType">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="PAGE"/>
<xs:enumeration value="FOOTNOTE"/>
<xs:enumeration value="ENDNOTE"/>
<xs:enumeration value="PICTURE"/>
<xs:enumeration value="TABLE"/>
<xs:enumeration value="EQUATION"/>
<xs:enumeration value="TOTAL_PAGE"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
<xs:complexType name="ListItemType">
<xs:attribute name="displayText" type="xs:string"/>
<xs:attribute name="value" type="xs:string"/>
</xs:complexType>
<xs:complexType name="ParameterList">
<xs:choice minOccurs="1" maxOccurs="unbounded">
<xs:element name="booleanParam">
<xs:complexType>
<xs:simpleContent>

<xs:extension base="xs:boolean">
<xs:attribute name="name" type="xs:string"/>
</xs:extension>
</xs:simpleContent>
</xs:complexType>
</xs:element>
<xs:element name="integerParam">
<xs:complexType>
<xs:simpleContent>
<xs:extension base="xs:integer">
<xs:attribute name="name" type="xs:string"/>
</xs:extension>
</xs:simpleContent>
</xs:complexType>
</xs:element>
<xs:element name="floatParam">
<xs:complexType>
<xs:simpleContent>
<xs:extension base="xs:float">
<xs:attribute name="name" type="xs:string"/>
</xs:extension>
</xs:simpleContent>
</xs:complexType>
</xs:element>
<xs:element name="stringParam">
<xs:complexType>
<xs:simpleContent>
<xs:extension base="xs:string">
<xs:attribute name="name" type="xs:string"/>
<xs:attribute ref="xml:space"/>
</xs:extension>
</xs:simpleContent>
</xs:complexType>
</xs:element>
<xs:element name="listParam" type="hp:ParameterList"/>
</xs:choice>
<xs:attribute name="cnt" type="xs:positiveInteger" use="required"/>
<xs:attribute name="name" type="xs:string"/>
</xs:complexType>
<xs:complexType name="TrackChangeTag">
<xs:attribute name="paraend" type="xs:boolean"/>
<xs:attribute name="TcId" type="xs:nonNegativeInteger"/>
<xs:attribute name="Id" type="xs:nonNegativeInteger"/>
</xs:complexType>
</xs:schema>
```
