# C CFB 라이브러리의 Zig/WASM 연동 검증

> 보관된 실험입니다. GPL/LGPL 제외 정책으로 이 후보는 제품에 채택하지 않습니다. 아래 실행 위치는 `legacy/rust/` 기준입니다.

2026-09-05, macOS arm64, Zig 0.16.0. 제품 API가 아닌 통합 실험이다.

## 결과

- **libolecf 20240427:** Zig C 컴파일러로 wasm32-wasi 라이브러리와 reactor 빌드 성공.
- Node WebAssembly와 실제 Chromium에서 각각 HWP fixture 48개, FileHeader/DocInfo 96개 스트림 읽기 성공.
- FileHeader는 256바이트 길이와 `HWP Document File` 시그니처를 검사했다. DocInfo는 비어 있지 않은 스트림 추출을 검사했다. 바이트 전체의 기준 구현 대조는 하지 않았다.
- WASM 외부 import: **0개**. `{}`로 인스턴스화하며 WASI/파일시스템 shim이 필요하지 않았다.
- `-O2`, 심볼 제거 후 **90,331 bytes (88.2 KiB)**. 압축 전 크기이며 CFB 래퍼와 연결된 C 런타임을 포함한다. HWP 파서·DEFLATE·Zig 상위 로직은 포함하지 않는다.
- 초기 선형 메모리는 실험 설정상 64 MiB다. 이는 바이너리 크기나 측정된 최소 메모리 요구량과 다르다.
- 메모리 입력은 `libbfio_memory_range_initialize/set` → `libolecf_file_open_file_io_handle`로 연결한다. JS 입력을 WASM 메모리로 복사하는 단계가 있으며 zero-copy를 주장하지 않는다.
- 암호화/배포용 파일도 **컨테이너 스트림 추출**은 성공했다. 복호화·HWP 필드 해석·전체 스트림 호환성·손상 입력 안전성 검증은 이 실험에 포함되지 않는다.

## 후보 비교

| 후보 | 메모리 입력 | 의존성 | 이번 확인 |
|---|---|---|---|
| libolecf | libbfio memory range | 동봉 libcerror/libcdata/libuna/libbfio 등 14개 보조 라이브러리 | WASM 빌드 및 Chromium 실행 성공 |
| libgsf | gsf_input_memory_new → gsf_infile_msole_new | GLib, GObject, GIO, libxml2 등 | 소스/API/빌드 요구사항 확인; WASM 빌드와 크기 미측정 |

libolecf 라이브러리 라이선스는 LGPL-3.0-or-later, libgsf README는 LGPL-2.1을 명시한다. 라이선스가 없는 자체 코드처럼 취급해서는 안 된다.

libgsf는 불가능 판정이 아니다. CFB만 필요한 이 실험에서는 먼저 libolecf의 실제 연동 가능성을 검증했다. 제품 채택 전에는 라이선스 적합성, 손상 입력 처리, 전체 스트림 바이트 비교와 메모리 제한을 별도로 평가해야 한다.

## 재현

소스는 저장소 루트의 `reference/libolecf-20240427`에 압축 해제한다.

- 배포본: https://deb.debian.org/debian/pool/main/libo/libolecf/libolecf_20240427.orig.tar.gz
- SHA256: `3cc0403a3c2b12287b8a19604616f5079831e2bb6e3dc7fc25d0844489ee8aab`
- upstream: https://github.com/libyal/libolecf
- libgsf 소스: https://github.com/GNOME/libgsf/tree/cda017ac3b4b7184e938b16c68d9245252dee6ee

`legacy/rust/`에서:

```sh
(cd ../../reference/libolecf-20240427 && ./configure \
  --host=wasm32-unknown-wasi CC='zig cc -target wasm32-wasi' \
  AR='zig ar' RANLIB='zig ranlib' CFLAGS='-O2' \
  --disable-shared --disable-nls --disable-multi-threading-support \
  --disable-wide-character-type --disable-python --with-libfuse=no)
sh benchmarks/cfb-c-spike/build.sh
node benchmarks/cfb-c-spike/check.mjs
node benchmarks/cfb-c-spike/serve.mjs
```

브라우저에서 `http://127.0.0.1:11309`를 연다.

期待結果: `{"passed":48,"streams":96,"imports":[],"wasmBytes":90331}`。

全体の `make` は CLI の POSIX signal API で失敗するため、build.sh は必要なライブラリのみをビルドする。上流 C ソースは変更していない。probe.c は同梱版の内部ヘッダーを使うため、このバージョンに固定した実験であり、安定した製品向け公開ヘッダーラッパーは別途必要。

Emscripten はローカル環境の Python/LLVM 設定で起動できなかったため使用していない。成功した経路は Zig cc → wasm32-wasi → import のない WASM → ブラウザ WebAssembly API。
