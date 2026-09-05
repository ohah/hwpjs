# HWP 자료형 (Types)

HWP 5.0 스펙 문서의 "표 1: 자료형"에 정의된 모든 자료형을 Rust 타입으로 매핑한 것입니다.

## 개요

`hwp-core` 라이브러리는 HWP 파일을 파싱할 때 스펙 문서의 자료형을 그대로 사용합니다. 이는 스펙 문서와 코드의 1:1 매핑을 유지하여 유지보수성을 높이기 위함입니다.

모든 자료형 정의는 `crates/hwp-core/src/types.rs`에 위치합니다.

## JSON 직렬화 타입

HWP 자료형이 JSON으로 직렬화될 때의 타입은 다음과 같습니다:

| Rust 타입 | JSON 타입 | 예시 |
|---|---|---|
| `BYTE` | `number` | `0`, `255` |
| `WORD` | `number` | `0`, `65535` |
| `DWORD` | `number` | `0`, `4294967295` |
| `WCHAR` | `number` | `0`, `65535` |
| `HWPUNIT` | `number` | `7200`, `14400` |
| `SHWPUNIT` | `number` | `-7200`, `14400` |
| `COLORREF` | `number` | `16711680` (0x00FF0000 = 빨간색) |
| `UINT8`, `UINT16`, `UINT32` | `number` | `0`, `255`, `65535`, `4294967295` |
| `INT8`, `INT16`, `INT32` | `number` | `-128`, `-32768`, `-2147483648` |
| `HWPUNIT16` | `number` | `-32768`, `32767` |
| `Vec<u8>` (BYTE stream) | `array` of `number` | `[0, 1, 2, ...]` |
| `String` | `string` | `"HWP Document File"` |

**특수 직렬화**:
- `HWPUNIT`, `SHWPUNIT`, `COLORREF`는 구조체이지만 JSON에서는 숫자로 직렬화됩니다.
- `FileHeader.version`은 문자열로 직렬화됩니다 (예: `"5.0.3.0"`).
- `FileHeader.document_flags`와 `FileHeader.license_flags`는 문자열 배열로 직렬화됩니다 (예: `["compressed", "encrypted"]`).

## 기본 자료형

### BYTE

**스펙 문서 매핑**: 표 1 - BYTE

- **길이**: 1 바이트
- **부호**: 없음
- **범위**: 0~255
- **Rust 타입**: `u8`
- **설명**: 부호 없는 한 바이트

```rust
pub type BYTE = u8;
```

### WORD

**스펙 문서 매핑**: 표 1 - WORD

- **길이**: 2 바이트
- **부호**: 없음
- **Rust 타입**: `u16`
- **설명**: 16비트 컴파일러에서 'unsigned int'에 해당

```rust
pub type WORD = u16;
```

### DWORD

**스펙 문서 매핑**: 표 1 - DWORD

- **길이**: 4 바이트
- **부호**: 없음
- **Rust 타입**: `u32`
- **설명**: 16비트 컴파일러에서 'unsigned long'에 해당

```rust
pub type DWORD = u32;
```

### WCHAR

**스펙 문서 매핑**: 표 1 - WCHAR

- **길이**: 2 바이트
- **부호**: 없음
- **Rust 타입**: `u16`
- **설명**: 한글의 기본 코드로 유니코드 기반 문자. 한글의 내부 코드로 표현된 문자 한 글자. 한글, 영문, 한자를 비롯해 모든 문자가 2 바이트의 일정한 길이를 가진다.

```rust
pub type WCHAR = u16;
```

## 부호 있는 정수형

### INT8

**스펙 문서 매핑**: 표 1 - INT8

- **길이**: 1 바이트
- **부호**: 있음
- **Rust 타입**: `i8`
- **설명**: 'signed_int8'에 해당

```rust
pub type INT8 = i8;
```

### INT16

**스펙 문서 매핑**: 표 1 - INT16

- **길이**: 2 바이트
- **부호**: 있음
- **Rust 타입**: `i16`
- **설명**: 'signed_int16'에 해당

```rust
pub type INT16 = i16;
```

### INT32

**스펙 문서 매핑**: 표 1 - INT32

- **길이**: 4 바이트
- **부호**: 있음
- **Rust 타입**: `i32`
- **설명**: 'signed_int32'에 해당

```rust
pub type INT32 = i32;
```

## 부호 없는 정수형

### UINT8

**스펙 문서 매핑**: 표 1 - UINT8

- **길이**: 1 바이트
- **부호**: 없음
- **Rust 타입**: `u8`
- **설명**: 'unsigned_int8'에 해당

```rust
pub type UINT8 = u8;
```

### UINT16

**스펙 문서 매핑**: 표 1 - UINT16

- **길이**: 2 바이트
- **부호**: 없음
- **Rust 타입**: `u16`
- **설명**: 'unsigned_int16'에 해당

```rust
pub type UINT16 = u16;
```

### UINT32 / UINT

**스펙 문서 매핑**: 표 1 - UINT32(=UINT)

- **길이**: 4 바이트
- **부호**: 없음
- **Rust 타입**: `u32`
- **설명**: 'unsigned_int32'에 해당. UINT는 UINT32와 동일

```rust
pub type UINT32 = u32;
pub type UINT = UINT32;
```

## HWP 특수 자료형

### HWPUNIT

**스펙 문서 매핑**: 표 1 - HWPUNIT

- **길이**: 4 바이트
- **부호**: 없음
- **Rust 타입**: `HWPUNIT` (구조체)
- **설명**: 1/7200인치로 표현된 한글 내부 단위. 문자의 크기, 그림의 크기, 용지 여백 등 문서 구성 요소의 크기를 표현

**사용 예시**:
- 가로 2인치 x 세로 1인치 그림 → `HWPUNIT(14400)` x `HWPUNIT(7200)`

**메서드**:
- `to_inches() -> f64`: 인치 단위로 변환
- `from_inches(inches: f64) -> Self`: 인치 단위에서 생성
- `value() -> u32`: 내부 값 반환

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct HWPUNIT(pub u32);

// 사용 예시
let width = HWPUNIT::from_inches(2.0);  // 2인치
let inches = width.to_inches();         // 2.0
```

### SHWPUNIT

**스펙 문서 매핑**: 표 1 - SHWPUNIT

- **길이**: 4 바이트
- **부호**: 있음
- **Rust 타입**: `SHWPUNIT` (구조체)
- **설명**: 1/7200인치로 표현된 한글 내부 단위 (부호 있는 버전). HWPUNIT의 부호 있는 버전

**메서드**:
- `to_inches() -> f64`: 인치 단위로 변환
- `from_inches(inches: f64) -> Self`: 인치 단위에서 생성
- `value() -> i32`: 내부 값 반환

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct SHWPUNIT(pub i32);
```

### HWPUNIT16

**스펙 문서 매핑**: 표 1 - HWPUNIT16

- **길이**: 2 바이트
- **부호**: 있음
- **Rust 타입**: `i16`
- **설명**: INT16과 같음

```rust
pub type HWPUNIT16 = i16;
```

### COLORREF

**스펙 문서 매핑**: 표 1 - COLORREF

- **길이**: 4 바이트
- **부호**: 없음
- **Rust 타입**: `COLORREF` (구조체)
- **설명**: **주의: 스펙 문서에는 "RGB값(0x00bbggrr)"로 표기되어 있으나, 실제로는 BGR 형식으로 저장됩니다.**
  - 형식: `0x00bbggrr` (BGR 순서)
  - `rr`: red 1 byte (하위 바이트)
  - `gg`: green 1 byte (중간 바이트)
  - `bb`: blue 1 byte (상위 바이트)
  - **중요**: 스펙 문서의 "RGB값"이라는 표현은 혼동을 줄 수 있으나, 실제 저장 형식은 BGR입니다.

**메서드**:
- `rgb(r: u8, g: u8, b: u8) -> Self`: RGB 값으로 생성
- `r() -> u8`: Red 값 추출
- `g() -> u8`: Green 값 추출
- `b() -> u8`: Blue 값 추출
- `value() -> u32`: 내부 값 반환

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct COLORREF(pub u32);

// 사용 예시
let red = COLORREF::rgb(255, 0, 0);  // 빨간색
let r = red.r();  // 255
let g = red.g();  // 0
let b = red.b();  // 0
```

## 기타

### BYTE stream

**스펙 문서 매핑**: 표 1 - BYTE stream

- **길이**: 가변
- **설명**: 일련의 BYTE로 구성됨. 본문 내에서 다른 구조를 참조할 경우에 사용됨.

Rust에서는 `Vec<u8>` 또는 `&[u8]`로 표현됩니다.

## 자료형 매핑 표

| 스펙 문서 자료형 | Rust 타입 | 길이 | 부호 | 설명 |
|---|---|---|---|---|
| BYTE | `u8` | 1 | 없음 | 부호 없는 한 바이트(0~255) |
| WORD | `u16` | 2 | 없음 | 16비트 unsigned int |
| DWORD | `u32` | 4 | 없음 | 32비트 unsigned long |
| WCHAR | `u16` | 2 | 없음 | 유니코드 기반 문자 |
| HWPUNIT | `HWPUNIT` | 4 | 없음 | 1/7200인치 단위 |
| SHWPUNIT | `SHWPUNIT` | 4 | 있음 | 1/7200인치 단위 (signed) |
| UINT8 | `u8` | 1 | 없음 | unsigned int8 |
| UINT16 | `u16` | 2 | 없음 | unsigned int16 |
| UINT32 | `u32` | 4 | 없음 | unsigned int32 |
| UINT | `u32` | 4 | 없음 | UINT32와 동일 |
| INT8 | `i8` | 1 | 있음 | signed int8 |
| INT16 | `i16` | 2 | 있음 | signed int16 |
| INT32 | `i32` | 4 | 있음 | signed int32 |
| HWPUNIT16 | `i16` | 2 | 있음 | INT16과 같음 |
| COLORREF | `COLORREF` | 4 | 없음 | RGB 값 (0x00bbggrr) |
| BYTE stream | `Vec<u8>` / `&[u8]` | 가변 | 없음 | 일련의 BYTE |

## 사용 원칙

1. **스펙 문서와 1:1 매핑**: 스펙 문서의 자료형 이름을 그대로 사용
2. **타입 안전성**: 도메인 특화 타입(`HWPUNIT`, `COLORREF` 등)은 구조체로 정의하여 타입 안전성 확보
3. **유지보수성**: 스펙 문서 변경 시 타입 정의만 수정하면 컴파일러가 영향 범위 자동 감지

## 플래그 상수

### Document Flags

`FileHeader.document_flags`는 비트 플래그로, JSON에서는 활성화된 플래그의 상수 문자열 배열로 직렬화됩니다.

**스펙 문서 매핑**: 표 3 - 속성 (첫 번째 DWORD)

| 비트 | 상수 | 설명 |
|---|---|---|
| 0 | `"compressed"` | 압축 여부 |
| 1 | `"encrypted"` | 암호 설정 여부 |
| 2 | `"distribution"` | 배포용 문서 여부 |
| 3 | `"script"` | 스크립트 저장 여부 |
| 4 | `"drm"` | DRM 보안 문서 여부 |
| 5 | `"xml_template"` | XMLTemplate 스토리지 존재 여부 |
| 6 | `"history"` | 문서 이력 관리 존재 여부 |
| 7 | `"electronic_signature"` | 전자 서명 정보 존재 여부 |
| 8 | `"certificate_encryption"` | 공인 인증서 암호화 여부 |
| 9 | `"signature_preview"` | 전자 서명 예비 저장 여부 |
| 10 | `"certificate_drm"` | 공인 인증서 DRM 보안 문서 여부 |
| 11 | `"ccl"` | CCL 문서 여부 |
| 12 | `"mobile_optimized"` | 모바일 최적화 여부 |
| 13 | `"privacy_security"` | 개인 정보 보안 문서 여부 |
| 14 | `"track_change"` | 변경 추적 문서 여부 |
| 15 | `"kogl"` | 공공누리(KOGL) 저작권 문서 |
| 16 | `"video_control"` | 비디오 컨트롤 포함 여부 |
| 17 | `"table_of_contents"` | 차례 필드 컨트롤 포함 여부 |

**JSON 예시**:
```json
{
  "document_flags": ["compressed"]
}
```

### License Flags

`FileHeader.license_flags`는 비트 플래그로, JSON에서는 활성화된 플래그의 상수 문자열 배열로 직렬화됩니다.

**스펙 문서 매핑**: 표 3 - 속성 (두 번째 DWORD)

| 비트 | 상수 | 설명 |
|---|---|---|
| 0 | `"ccl_kogl"` | CCL, 공공누리 라이선스 정보 |
| 1 | `"copy_restricted"` | 복제 제한 여부 |
| 2 | `"copy_allowed_same_condition"` | 동일 조건 하에 복제 허가 여부 (복제 제한인 경우 무시) |

**JSON 예시**:
```json
{
  "license_flags": ["ccl_kogl", "copy_restricted"]
}
```

## 제어 문자 파라미터

### InlineControlParam

INLINE 타입 제어 문자는 제어 문자 코드(2 bytes) 이후에 12 bytes의 파라미터 데이터를 가집니다. 이 파라미터는 제어 문자 타입에 따라 다른 의미를 가집니다.

**스펙 문서 매핑**: 표 6 - 제어 문자 (INLINE 타입)

**구조**:
```rust
pub struct InlineControlParam {
    pub width: Option<HWPUNIT>,  // TAB 제어 문자용
    pub chid: Option<String>,    // 기타 INLINE 제어 문자용
}
```

#### `width: Option<HWPUNIT>`

- **제어 문자**: `TAB` (0x09)
- **설명**: 탭의 너비를 1/7200인치 단위로 표현
- **파싱**: 파라미터의 첫 4바이트를 UINT32로 읽어서 HWPUNIT으로 변환
- **JSON 예시**:
```json
{
  "inline_control_params": [
    [16, { "width": 4000 }]
  ]
}
```

#### `chid: Option<String>`

- **제어 문자**: `FIELD_END` (0x04), `TITLE_MARK` (0x08), 기타 INLINE 타입
- **설명**: 스펙 문서에 명시되지 않은 식별자. 정확한 의미는 알 수 없음
- **파싱**: 파라미터의 첫 4바이트를 ASCII 문자열로 읽기 시도 (0x20-0x7E 범위의 바이트만 허용)
- **주의사항**: 
  - 스펙 문서에 파라미터 구조가 명시되지 않아 정확한 의미를 알 수 없음
  - ASCII로 읽을 수 있는 경우에만 `chid` 값이 설정됨
  - 바이너리 데이터는 JSON으로 표현할 수 없으므로 저장하지 않음
- **JSON 예시**:
```json
{
  "inline_control_params": [
    [65, { "chid": "klh" }]
  ]
}
```

**참고**:
- JSON으로 표현 가능한 의미 있는 값만 저장됩니다
- 바이너리 데이터는 저장하지 않습니다
- `width`와 `chid`는 제어 문자 타입에 따라 하나만 설정됩니다

## 컨트롤 헤더 데이터 구조

### FootnoteEndnote

각주/미주 컨트롤 헤더의 8바이트 데이터 구조입니다.

**스펙 문서 매핑**: 표 4.3.10.4 - 각주/미주

**구조**:
```rust
pub struct FootnoteEndnote {
    pub number: UINT8,           // 각주/미주 번호
    pub reserved: [UINT8; 5],     // 예약 영역 (5 bytes)
    pub attribute: UINT8,         // 속성 또는 플래그
    pub reserved2: UINT8,         // 예약 영역
}
```

**JSON 예시**:
```json
{
  "data_type": "footnote_endnote",
  "number": 1,
  "reserved": [0, 0, 0, 0, 0],
  "attribute": 41,
  "reserved2": 0
}
```

**필드 설명**:
- `number`: 각주/미주 번호 (첫 번째 바이트)
- `reserved`: 예약 영역 (바이트 1-5)
- `attribute`: 속성 또는 플래그 (바이트 6, 현재 41)
- `reserved2`: 예약 영역 (바이트 7)

**참고**:
- 스펙 문서에서는 "쓰레기 값이나 불필요한 업데이트를 줄이기 위해 8 byte를 serialize한다"고 명시되어 있지만, 실제 데이터에는 각주/미주 번호 등 유용한 정보가 포함되어 있습니다.
- 각주 참조 위치(본문)에서 사용되는 번호 정보입니다.

### HeaderFooter

머리말/꼬리말 컨트롤 헤더의 데이터 구조입니다.

**스펙 문서 매핑**: 표 140 - 머리말/꼬리말, 표 141 - 머리말/꼬리말 속성

**구조**:
```rust
pub struct HeaderFooter {
    pub attribute: HeaderFooterAttribute,  // 속성 (표 141 참조)
    pub text_width: HWPUNIT,              // 텍스트 영역의 폭
    pub text_height: HWPUNIT,              // 텍스트 영역의 높이
    pub text_ref: UINT8,                   // 각 비트가 해당 레벨의 텍스트에 대한 참조를 했는지 여부
    pub number_ref: UINT8,                 // 각 비트가 해당 레벨의 번호에 대한 참조를 했는지 여부
}

pub struct HeaderFooterAttribute {
    pub apply_page: ApplyPage,            // 머리말이 적용될 범위(페이지 종류)
}

pub enum ApplyPage {
    Both,        // 양쪽
    EvenOnly,    // 짝수 쪽만
    OddOnly,     // 홀수 쪽만
}
```

**JSON 예시**:
```json
{
  "data_type": "header_footer",
  "attribute": {
    "apply_page": "both"
  },
  "text_width": 42520,
  "text_height": 0,
  "text_ref": 0,
  "number_ref": 0
}
```

**필드 설명**:
- `attribute.apply_page`: 머리말이 적용될 범위(페이지 종류)
  - `both`: 양쪽 페이지에 적용
  - `even_only`: 짝수 쪽에만 적용
  - `odd_only`: 홀수 쪽에만 적용
- `text_width`: 텍스트 영역의 폭 (HWPUNIT)
- `text_height`: 텍스트 영역의 높이 (HWPUNIT)
- `text_ref`: 각 비트가 해당 레벨의 텍스트에 대한 참조를 했는지 여부 (BYTE)
- `number_ref`: 각 비트가 해당 레벨의 번호에 대한 참조를 했는지 여부 (BYTE)

**참고**:
- 머리말/꼬리말은 문단 리스트를 포함합니다.
- `text_ref`와 `number_ref`는 각 비트가 해당 레벨(문서 레벨, 구역 레벨 등)의 텍스트/번호에 대한 참조를 했는지 여부를 나타냅니다.

**가변 길이 처리** / **Variable length handling**:

스펙 문서에는 14바이트로 명시되어 있지만, 실제 파일에서는 **가변 길이**일 수 있습니다.
레거시 라이브러리들(libhwp, hwpjs.js)의 구현을 참고하여 다음과 같이 처리합니다:

- **libhwp**: 레코드 헤더의 크기(`header.size`)와 현재까지 읽은 바이트 수(`readAfterHeader`)를 비교하여 가변 길이를 처리합니다.
  - `applyPage` (4바이트)는 항상 읽습니다.
  - `if (!sr.isEndOfRecord())` 또는 `if (sr.header.size > sr.readAfterHeader)`로 체크하여 추가 필드를 읽습니다.

- **hwpjs.js**: 주석에 "이때는 사이즈가 8로 아무것도 없음"이라고 명시되어 있어, 컨트롤 ID(4바이트) + 데이터(4바이트) = 8바이트인 경우도 있습니다.

**현재 구현의 가변 길이 처리 기준** / **Current implementation's variable length handling criteria**:

- 최소 4바이트: `applyPage` (속성) 필수
- 8바이트 이상: `textWidth` 읽기
- 12바이트 이상: `textHeight` 읽기
- 13바이트 이상: `text_ref` 읽기
- 14바이트 이상: `number_ref` 읽기

데이터가 없는 필드는 기본값(0)을 사용합니다.

### ColumnDefinition

단 정의 컨트롤 헤더의 데이터 구조입니다.

**스펙 문서 매핑**: 표 138 - 단 정의, 표 139 - 단 정의 속성

**구조**:
```rust
pub struct ColumnDefinition {
    pub attribute: ColumnDefinitionAttribute,
    pub column_spacing: HWPUNIT16,
    pub column_widths: Vec<HWPUNIT16>,
    pub attribute_high: UINT16,
    pub divider_line_type: UINT8,
    pub divider_line_thickness: UINT8,
    pub divider_line_color: UINT32,
}

pub struct ColumnDefinitionAttribute {
    pub column_type: ColumnType,        // 단 종류
    pub column_count: UINT8,            // 단 개수
    pub column_direction: ColumnDirection, // 단 방향 지정
    pub equal_width: bool,              // 단 너비 동일하게 여부
}
```

**JSON 예시**:
```json
{
  "data_type": "column_definition",
  "attribute": {
    "column_type": "normal",
    "column_count": 1,
    "column_direction": "left",
    "equal_width": true
  },
  "column_spacing": 0,
  "column_widths": [],
  "attribute_high": 0,
  "divider_line_type": 0,
  "divider_line_thickness": 0,
  "divider_line_color": 0
}
```

**필드 설명**:
- `attribute.column_type`: 단 종류 (`normal`, `distributed`, `parallel`)
- `attribute.column_count`: 단 개수 (1-255)
- `attribute.column_direction`: 단 방향 지정 (`left`, `right`, `both`)
- `attribute.equal_width`: 단 너비 동일하게 여부 (bit 12)
- `column_spacing`: 단 사이 간격 (HWPUNIT16)
- `column_widths`: 단 너비 배열 (단 너비가 동일하지 않을 때만)
- `attribute_high`: 속성의 bit 16-31
- `divider_line_type`: 단 구분선 종류
- `divider_line_thickness`: 단 구분선 굵기
- `divider_line_color`: 단 구분선 색상 (COLORREF)

**참고**:
- `equal_width`가 `true`이면 `column_widths`는 빈 배열입니다.
- `attribute_high`는 속성의 상위 16비트로, 스펙 문서에 명시되지 않은 추가 속성 정보를 포함할 수 있습니다.

### Caption

캡션 정보 구조입니다.

**스펙 문서 매핑**: 표 72 - 캡션, 표 73 - 캡션 속성

**구조**:
```rust
pub struct Caption {
    pub align: CaptionAlign,           // 캡션 정렬 방향
    pub include_margin: bool,          // 캡션 폭에 마진 포함 여부
    pub width: HWPUNIT,                // 캡션 폭 (세로 방향일 때만 사용)
    pub gap: HWPUNIT16,                // 캡션과 개체 사이 간격
    pub last_width: HWPUNIT,           // 텍스트의 최대 길이 (=개체의 폭)
    pub vertical_align: Option<CaptionVAlign>, // 캡션 수직 정렬 (조합 캡션 구분용)
}

pub enum CaptionAlign {
    Left,    // 왼쪽
    Right,   // 오른쪽
    Top,     // 위
    Bottom,  // 아래
}

pub enum CaptionVAlign {
    Top,     // 위
    Middle,  // 가운데
    Bottom,  // 아래
}
```

**JSON 예시**:
```json
{
  "caption": {
    "align": "left",
    "include_margin": false,
    "width": 8504,
    "gap": 850,
    "last_width": 8504,
    "vertical_align": "middle"
  }
}
```

**필드 설명**:
- `align`: 캡션 정렬 방향 (표 73 참조)
  - `left`: 왼쪽
  - `right`: 오른쪽
  - `top`: 위
  - `bottom`: 아래
- `include_margin`: 캡션 폭에 마진을 포함할 지 여부 (가로 방향일 때만 사용)
- `width`: 캡션 폭 (세로 방향일 때만 사용, HWPUNIT)
- `gap`: 캡션과 개체 사이 간격 (HWPUNIT16)
- `last_width`: 텍스트의 최대 길이 (=개체의 폭, HWPUNIT)
- `vertical_align`: 캡션 수직 정렬 (조합 캡션 구분용)
  - `top`: 위
  - `middle`: 가운데
  - `bottom`: 아래

**주의사항** / **Important Notes**:

#### `vertical_align` 필드

**주의: 스펙 문서에는 명시되어 있지 않지만, ListHeaderProperty의 bit 5-6에서 수직 정렬 정보를 가져옵니다.**

**Note: Not specified in the spec document, but vertical alignment information is extracted from ListHeaderProperty bit 5-6.**

**참고**: pyhwp는 `ListHeader.VAlign = Enum(TOP=0, MIDDLE=1, BOTTOM=2)`로 파싱합니다.

**Reference**: pyhwp parses this as `ListHeader.VAlign = Enum(TOP=0, MIDDLE=1, BOTTOM=2)`.

이 필드는 조합 캡션(예: "왼쪽 위", "오른쪽 아래")을 구분하는 데 사용됩니다:
- `vertical_align = "middle"`: 단순 수직 캡션 (왼쪽, 오른쪽)
- `vertical_align = "top"` 또는 `"bottom"`: 조합 캡션 (왼쪽 위, 오른쪽 아래 등)

This field is used to distinguish combination captions (e.g., "left top", "right bottom"):
- `vertical_align = "middle"`: Simple vertical caption (left, right)
- `vertical_align = "top"` or `"bottom"`: Combination caption (left top, right bottom, etc.)

**참고**:
- 캡션은 별도 레코드(LIST_HEADER)로 처리됩니다.
- `vertical_align`은 `ListHeaderProperty`의 bit 5-6에서 파싱됩니다.
- 스펙 문서에는 명시되지 않았지만, 실제 파일에서 사용되는 정보입니다.

## 참고

- **스펙 문서**: [HWP 5.0 명세서 - 표 1: 자료형](./hwp-5.0.md#2-자료형-설명)
- **소스 코드**: `crates/hwp-core/src/types.rs`
- **플래그 상수**: `crates/hwp-core/src/fileheader.rs`의 `document_flags`, `license_flags` 모듈
- **제어 문자**: `crates/hwp-core/src/document/bodytext/control_char.rs`
- **컨트롤 헤더**: `crates/hwp-core/src/document/bodytext/ctrl_header.rs`

