# 부속서 H (규정) Document History XML 스키마

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
  xmlns="http://www.owpml.org/owpml/2024/history"
  targetNamespace="http://www.owpml.org/owpml/2024/history"
  elementFormDefault="qualified">
  <xs:element name="history" type="HWPMLHistoryType"/>
  <xs:complexType name="HWPMLHistoryType">
    <xs:sequence>
      <xs:element name="historyEntry" type="HistoryEntryType" maxOccurs="unbounded"/>
    </xs:sequence>
    <xs:attribute name="version" type="xs:string" use="required"/>
  </xs:complexType>
  <xs:complexType name="HistoryEntryType">
    <xs:sequence maxOccurs="1">
      <xs:element name="packageDiff" type="DiffEntryType" minOccurs="0"/>
      <xs:element name="headDiff" type="DiffEntryType" minOccurs="0"/>
      <xs:element name="bodyDiff" type="DiffEntryType" minOccurs="0" maxOccurs="unbounded"/>
      <xs:element name="tailDiff" type="DiffEntryType" minOccurs="0"/>
    </xs:sequence>
    <xs:attribute name="revisionNumber" type="xs:nonNegativeInteger"/>
    <xs:attribute name="revisionDate">
      <xs:simpleType>
        <xs:restriction base="xs:string">
          <xs:pattern value="[0-9]{4}-[01][0-9]-[0-3][0-9] [0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9]{3}"/>
        </xs:restriction>
      </xs:simpleType>
    </xs:attribute>
    <xs:attribute name="revisionAuthor" type="xs:string"/>
    <xs:attribute name="revisionDesc" type="xs:string"/>
    <xs:attribute name="revisionLock" type="xs:boolean" default="false"/>
    <xs:attribute name="autoSave" type="xs:boolean" default="false"/>
  </xs:complexType>
  <xs:complexType name="DiffDataType" abstract="true">
    <xs:attribute name="path" type="xs:string"/>
  </xs:complexType>
  <xs:complexType name="InsertType">
    <xs:complexContent>
      <xs:extension base="DiffDataType"/>
    </xs:complexContent>
  </xs:complexType>
  <xs:complexType name="UpdateType">
    <xs:complexContent>
      <xs:extension base="DiffDataType">
        <xs:choice minOccurs="0" maxOccurs="unbounded">
          <xs:element name="insert" type="InsertType"/>
          <xs:element name="update" type="UpdateType"/>
          <xs:element name="delete" type="DeleteType"/>
          <xs:element name="position" type="PositionType"/>
        </xs:choice>
        <xs:attribute name="oldValue" type="xs:string"/>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>
  <xs:complexType name="DeleteType" mixed="true">
    <xs:complexContent>
      <xs:extension base="DiffDataType">
        <xs:sequence>
          <xs:any namespace="##any" processContents="lax" minOccurs="0"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>
  <xs:complexType name="PositionType">
    <xs:complexContent>
      <xs:extension base="DiffDataType"/>
    </xs:complexContent>
  </xs:complexType>
  <xs:complexType name="DiffEntryType">
    <xs:choice maxOccurs="unbounded">
      <xs:element name="insert" type="InsertType"/>
      <xs:element name="update" type="UpdateType"/>
      <xs:element name="delete" type="DeleteType"/>
      <xs:element name="position" type="PositionType"/>
    </xs:choice>
    <xs:attribute name="href" type="xs:string">
      <xs:annotation>
        <xs:documentation>변경 추적 대상 파일의 경로. 컨테이너 내에서의 절대 경로.</xs:documentation>
      </xs:annotation>
    </xs:attribute>
  </xs:complexType>
</xs:schema>
```
