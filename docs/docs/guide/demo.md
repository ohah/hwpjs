# 데모

실제 HWP 파일을 파싱한 결과를 확인할 수 있습니다.

## noori.hwp

한국형발사체 "누리호" 관련 보도자료입니다. 다양한 HWP 기능을 포함하고 있습니다:
- 표 (Table)
- 이미지
- 문단 서식
- 페이지 레이아웃

### JSON 결과

파싱된 JSON 데이터를 확인하세요:

[전체 JSON 보기](/hwpjs/demo/noori.json)

JSON 파일은 약 1.4MB 크기이며, HWP 문서의 모든 구조 정보를 포함합니다.

### Markdown 결과

변환된 Markdown을 확인하세요:

[전체 Markdown 보기](/hwpjs/demo/noori.md)

### Markdown 미리보기

변환된 Markdown의 일부를 확인할 수 있습니다:

# HWP 문서

**버전**: 5.00.03.00

![이미지](/hwpjs/demo/images/BIN0001.jpg)

| 보도일시<br> | 2018. 9. 4.(화) 조간(온라인 9. 3. 12:00)부터 보도해 주시기 바랍니다.  <br> |   |   |
|---|---|---|---|
| 배포일시<br> | 2018. 9. 3.(월) 09:00<br> | 담당부서<br> | 거대공공연구정책과<br> |
| 담당과장<br> | 장인숙(02-2110-2430)<br> | 담 당 자<br> |  용찬재 사무관(02-2110-2428)<br> |

| 우리가 독자 개발하여 최초 발사하는 한국형발사체,<br> 국민이 정한 그 이름은 ｢누리｣<br> "세상"의 옛말로, 우주까지 확장된 새로운 세상을 연다는 의미 -<br> 명칭공모전에 1만건 이상 응모, 뜨거운 관심 보여 -<br> |
|---|

□ 과학기술정보통신부(장관 유영민, 이하 '과기정통부')는 우리나라 최초로 순수 우리기술로 개발 중인 한국형발사체(KSLV-2)의 새로운 이름으로 "누리"가 선정되었다고 밝혔다.

o 한국형발사체는 1.5톤급 실용위성을 지구 저궤도(600km~800km)까지 쏘아 올릴 수 있는 3단형 우주발사체로, 연간 130여개 기관이 참여하여 2021년 발사를 목표로 개발하고 있다.

o 올해 10월에는 한국형발사체의 핵심부품인 75톤 액체엔진의 비행성능을 확인하기 위해 시험발사체를 발사할 예정이다.

**더 많은 내용은 [전체 Markdown 보기](/hwpjs/demo/noori.md)에서 확인하세요.**

## 사용 방법

이 데모 파일을 사용하여 HWPJS의 기능을 테스트할 수 있습니다:

```typescript
import { parseHwp } from '@ohah/hwpjs';

// noori.hwp 파일 파싱
const jsonString = parseHwp('./noori.hwp');
const document = JSON.parse(jsonString);

// Markdown으로 변환
const markdown = document.toMarkdown({
  image_output_dir: './images',
  use_html: true,
  include_version: true,
  include_page_info: true
});

console.log(markdown);
```

## 파일 정보

- **원본 파일**: `examples/fixtures/noori.hwp`
- **JSON 크기**: 약 1.4MB (1,449,395 bytes)
- **Markdown 크기**: 약 4KB (4,183 bytes)
- **버전**: HWP 5.00.03.00

