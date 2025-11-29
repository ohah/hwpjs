# toMarkdown

HWP 문서를 마크다운 형식으로 변환하는 함수입니다.

:::info
이 기능은 `hwp-core`의 `viewer` 모듈에서 제공됩니다.
:::

## 시그니처

```rust
pub fn to_markdown(document: &HwpDocument) -> String
```

또는 `HwpDocument`의 메서드로 사용할 수 있습니다:

```rust
impl HwpDocument {
    pub fn to_markdown(&self) -> String
}
```

## 매개변수

### `document: &HwpDocument`

변환할 HWP 문서 객체입니다.

`hwp-core`의 `HwpParser::parse()` 메서드로 파싱된 문서를 전달합니다.

## 반환값

### `String`

변환된 마크다운 문자열입니다.

다음 내용이 포함됩니다:

- 문서 제목 및 버전 정보
- 본문 텍스트
- 컨트롤 객체 (표, 글상자 등)
- 페이지 구분선 (페이지 나누기 시)

## 예제

### 기본 사용법

```rust
use hwp_core::{HwpParser, HwpDocument};
use std::fs;

// HWP 파일 읽기
let data = fs::read("document.hwp")?;

// 문서 파싱
let parser = HwpParser::new();
let document = parser.parse(&data)?;

// 마크다운으로 변환
let markdown = document.to_markdown();
// 또는
// use hwp_core::viewer::to_markdown;
// let markdown = to_markdown(&document);
println!("{}", markdown);
```

### Node.js에서 사용

```typescript
import { readFileSync } from 'fs';
import { toMarkdown } from '@ohah/hwpjs';

// HWP 파일 읽기
const fileBuffer = readFileSync('./document.hwp');
const data = new Uint8Array(fileBuffer);

// 마크다운으로 변환 (base64 이미지 포함)
const result = toMarkdown(data, {
  image: 'base64', // 또는 'blob'으로 별도 이미지 배열 받기
  useHtml: true,
  includeVersion: true,
  includePageInfo: false,
});

console.log(result.markdown);
// base64 옵션 사용 시: result.images는 빈 배열
// blob 옵션 사용 시: result.images에 ImageData 배열 포함
```

## 지원 기능

### 텍스트 추출

- 문단 텍스트 추출
- 제어 문자 제거
- 공백 정규화

### 컨트롤 객체

다음 컨트롤 객체가 감지되고 마크다운으로 변환됩니다:

- **표 (Table)**: `*[표 내용은 추출되지 않았습니다]*`
- **그리기 개체 (Shape Object)**: 글상자, 그림 등
- **머리말/꼬리말 (Header/Footer)**: `*[머리말]*`, `*[꼬리말]*`
- **단 정의 (Column Definition)**: `*[단 정의]*`

:::warning
표와 그리기 개체의 실제 내용 추출은 아직 구현되지 않았습니다.
현재는 플레이스홀더만 표시됩니다.
:::

## 출력 형식

```markdown
# HWP 문서

**버전**: 5.00.03.00

[본문 내용...]

**표**: [표 설명]

*[표 내용은 추출되지 않았습니다]*

---

[다음 페이지 내용...]
```

## 제한사항

1. **표 내용**: 표의 셀 데이터는 아직 추출되지 않습니다.
2. **그리기 개체**: 글상자, 그림 등의 실제 내용은 추출되지 않습니다.
3. **스타일링**: 글자 모양, 문단 모양 등의 서식 정보는 반영되지 않습니다.
4. **이미지**: 이미지 데이터는 추출되지 않습니다.

## 참고

- 이 함수는 `hwp-core`의 `viewer` 모듈에 있습니다.
- `hwp-core`는 파싱(`document/`)과 변환(`viewer/`) 기능을 모두 포함하며, 모듈로 관심사를 분리합니다.
- `HwpDocument::to_markdown()` 메서드를 사용하거나 `hwp_core::viewer::to_markdown()` 함수를 직접 사용할 수 있습니다.
- 향후 PDF 등 다른 형식으로의 변환도 지원할 예정입니다.
