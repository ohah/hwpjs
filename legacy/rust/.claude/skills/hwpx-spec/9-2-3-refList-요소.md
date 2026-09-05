# 9.2.3 refList 요소

`<refList>` 요소는 본문에서 사용되는 각종 설정 데이터를 가지고 있는 요소이다. `<refList>` 요소는 header XML에서 대부분의 설정 정보를 가지고 있다. 하위 요소에 대한 자세한 설명은 9.3에서 서술한다.

#### 표 14 -- refList 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| fontfaces | 글꼴 정보 목록 |
| borderFills | 테두리/배경/채우기 정보 목록 |
| charProperties | 글자 모양 목록 |
| tabProperties | 탭 정의 목록 |
| numberings | 번호 문단 모양 목록 |
| bullets | 글머리표 문단 모양 목록 |
| paraProperties | 문단 모양 목록 |
| styles | 스타일 목록 |
| memoProperties | 메모 모양 목록 |
| trackChanges | 변경 추적 정보 목록 |
| trackChangeAuthors | 변경 추적 검토자 목록 |

#### 샘플 6 -- refList 예

```xml
<hh:refList>
  <hh:fontfaces itemCnt="7">
    <hh:fontface lang="HANGUL" fontCnt="2">
      <hh:font id="0" face="함초롬돋움" type="TTF" isEmbedded="0">
        <hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0"
          strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>
      </hh:font>
    </hh:fontface>
  </hh:fontfaces>
  <!-- ... -->
</hh:refList>
```
