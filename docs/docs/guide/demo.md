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

[원본 Markdown 파일 보기](/hwpjs/demo/noori.md)

<iframe 
    src="/hwpjs/demo/noori.html" 
    width="100%" 
    height="800" 
    style="border: 1px solid #ddd; border-radius: 4px; margin: 1em 0;"
    title="noori.hwp Markdown Preview">
</iframe>

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

