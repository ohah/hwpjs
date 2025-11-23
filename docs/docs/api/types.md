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
- **설명**: RGB값(0x00bbggrr)을 십진수로 표시
  - `rr`: red 1 byte
  - `gg`: green 1 byte
  - `bb`: blue 1 byte

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

## 참고

- **스펙 문서**: [HWP 5.0 명세서 - 표 1: 자료형](../spec/hwp-5.0.md#2-자료형-설명)
- **소스 코드**: `crates/hwp-core/src/types.rs`
- **플래그 상수**: `crates/hwp-core/src/fileheader.rs`의 `document_flags`, `license_flags` 모듈

