# ParaText `runs` (텍스트/컨트롤 토큰)

HWP 문단의 텍스트(`PARA_TEXT`)는 **UTF-16 텍스트 스트림**이며, 그 안에는 일반 문자뿐 아니라 **제어 문자(컨트롤)** 가 함께 섞여 있습니다.

HWPJS `hwp-core`는 JSON 직렬화에서 기존의 `ParaText.text`(순수 텍스트)와 `control_char_positions`(제어 문자 위치) 외에,
텍스트/컨트롤의 경계를 명확히 표현하기 위해 `runs`를 제공합니다.

## `ParaText` 필드 관계

- **`text`**: 제어 문자를 제거/변환한 **순수 텍스트**입니다.  
  - `SHAPE_OBJECT(표/개체)` 같은 비텍스트 제어문자는 `text`에 포함되지 않습니다.
  - `TAB` 등 “텍스트로 표현 가능한 제어문자”는 변환된 문자로 포함될 수 있습니다.
- **`control_char_positions`**: 원본 텍스트 스트림에서 발견된 제어문자의 목록입니다.
- **`runs`**: 원본 스트림을 **텍스트 토큰 / 컨트롤 토큰**으로 분해한 시퀀스입니다.

## Source of truth 규칙 (중요)

- **원본/Writer 관점의 Source of truth**: `runs`의 `control` 토큰(및 관련 문서 설정/파라미터)입니다.
- `runs.control.display_text`는 있을 수 있지만, 이는 **파생값(캐시)** 입니다.
  - 뷰어/프리뷰 용도로만 사용합니다.
  - `runs`/문서 설정과 불일치하면 **무시**해야 합니다.

## `runs` 스키마

`runs`는 다음 두 타입 중 하나의 토큰을 가집니다.

### `text`

```json
{
  "kind": "text",
  "text": "전"
}
```

### `control`

```json
{
  "kind": "control",
  "position": 1,
  "code": 11,
  "name": "SHAPE_OBJECT",
  "size_wchars": 8,
  "display_text": null
}
```

- **`position`**: **원본 텍스트 스트림 기준 WCHAR 인덱스(0-based)** 입니다.  
  이 값은 `ParaLineSeg.segments[].text_start_position`(원본 인덱스)과 같은 좌표계입니다.
- **`size_wchars`**: 원본 스트림에서 해당 제어문자가 차지하는 WCHAR 길이입니다. (스펙의 CHAR/INLINE/EXTENDED에 따라 1 또는 8 등)

## 예시: “전 + (표/개체) + 후”

```json
{
  "type": "para_text",
  "text": "전후",
  "runs": [
    { "kind": "text", "text": "전" },
    { "kind": "control", "position": 1, "code": 11, "name": "SHAPE_OBJECT", "size_wchars": 8 },
    { "kind": "text", "text": "후" }
  ]
}
```

이 구조를 사용하면:
- JSON에서 텍스트/오브젝트 경계가 손실되지 않고
- 뷰어(HTML/Markdown)가 “전 / [표] / 후”처럼 정확히 분리해 렌더링할 수 있습니다.


