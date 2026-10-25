# WASM 전송 크기

파서의 원본 WASM과 HTTP 압축 전송량은 별도로 측정한다. 압축 해제된 바이트가 같으면 Native 코드·안전 검사·export도 같다. 원본 크기를 줄인 것으로 표현하지 않는다.

## 압축 정책

`tools/preview-wasm-compression.mjs`가 Brotli 품질6과 gzip 레벨6을 소유한다. 개발 서버 두 곳은 이 결과의 bytes와 encoding을 그대로 응답하며, Content-Length·Content-Encoding·Vary를 맞춘다. HEAD는 같은 헤더와 빈 본문을 반환한다. 클라이언트가 둘 다 허용하면 같은 q값에서 Brotli를 선호한다. 명시적인 q=0·와일드카드·identity 우선순위를 반영하고, 지원 가능한 표현을 모두 거부하면 406으로 응답한다. 같은 encoding의 중복 항목이 충돌하면 거부 값을 우선한다. 협상 기준은 [RFC 9110 12.5.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.5.3)을 따른다.

캐시는 마지막 원본 한 개와 최대 두 압축 표현만 보관한다. 바이트가 같으면 재사용하고 원본 변경 때 두 표현을 함께 교체한다. 데모 서버의 주 WASM과 명시적인 미리보기 WASM은 listen 전에 두 표현을 준비해 최초 파일 요청의 압축 비용을 줄인다. 새로운 런타임 의존성은 추가하지 않는다.

## 2026-10-25 실측

b7 ReleaseSafe 원본 SHA256은 `b7aec1c9c674dbbef96c8c88e29a39e675a7eb85da630fe8707e7e2ad230bcee`, 크기는 5,661,087바이트다. runtime code section은 5,467,072바이트이며 제거할 debug/name section은 없었다.

| 표현 | 전송 바이트 | 기존 대비 감소 |
| --- | ---: | ---: |
| 기존 gzip 레벨1 | 2,337,222 | 기준 |
| gzip 레벨6 | 1,682,079 | 약28% |
| Brotli 품질6 | 1,316,771 | 약44% |

Bun 1.4.4 한 번의 압축 측정은 각각 약18ms·47ms·76ms였다. 서버 시동·전체 로딩 시간이나 모든 장치의 성능 보장은 아니다. HTTP에서 압축을 해제한 결과는 원본과 바이트 단위로 비교한다. 원본 파일 크기·WASM compile 비용·문서 파싱 시간은 이 변경으로 줄었다고 주장하지 않는다. 근거는 `zig-out/verification/wasm-transfer/`에 남긴다.

`ReleaseSmall`은 별도 비교 대상으로 다룬다. 설치된 Zig 0.17의 도움말은 이 모드에서 안전 검사가 꺼진다고 명시하므로, 전송 크기를 줄이기 위해 기존 ReleaseSafe 엔진을 이 모드로 교체하지 않는다.
