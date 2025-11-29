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

<a href="/hwpjs/demo/noori.json" target="_blank">전체 JSON 보기</a>

JSON 파일은 약 1.4MB 크기이며, HWP 문서의 모든 구조 정보를 포함합니다.

### Markdown 결과

변환된 Markdown을 확인하세요:

<a href="/hwpjs/demo/noori.md" target="_blank">원본 Markdown 파일 보기</a>

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
import { readFileSync } from 'fs';
import { parseHwpToMarkdown } from '@ohah/hwpjs';

// noori.hwp 파일 읽기
const fileBuffer = readFileSync('./noori.hwp');
const data = new Uint8Array(fileBuffer);

// 마크다운으로 변환 (base64 이미지 포함)
const result = parseHwpToMarkdown(data, {
  image: 'base64', // 마크다운에 base64 데이터 URI 직접 포함
  useHtml: true,
  includeVersion: true,
  includePageInfo: true,
});

console.log(result.markdown);
// result.images는 빈 배열 (base64 옵션 사용 시)
```

## 파일 정보

- **원본 파일**: `examples/fixtures/noori.hwp`
- **JSON 크기**: 약 1.4MB (1,449,395 bytes)
- **Markdown 크기**: 약 4KB (4,183 bytes)
- **버전**: HWP 5.00.03.00

