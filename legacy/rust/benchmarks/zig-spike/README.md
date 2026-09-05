# Zig HWP5 parser spike

이 디렉터리는 Rust에서 Zig로 전환할지 판단하기 위한 작은 비교 실험이다.

현재 구현 범위는 제품 파서가 아니다.

- CFB 헤더와 FAT/DIFAT/Directory 읽기
- `FileHeader`, `DocInfo`, `BodyText/Section0` 스트림 추출
- HWP raw-deflate 해제
- HWP 레코드 헤더와 payload 경계 스캔

Rust의 `full` 모드는 현재 `hwp-core::HwpParser` 전체 HWP5 파싱을 실행한다. `probe` 모드는 Zig와 동일한 1차 포맷 처리 범위를 실행한다. 따라서 `probe`끼리만 언어·저수준 구현 비교에 사용하고, `full`은 현재 제품 경로의 기준선으로 별도 기록한다. HWPX는 이 첫 spike의 비교 대상에서 제외했다.

## Build

```sh
zig build-exe -O ReleaseFast zig/main.zig -femit-bin=zig/hwp5-probe
cargo build --manifest-path rust/Cargo.toml --release
```

## Run

```sh
fixture=../../crates/hwp-core/tests/fixtures/example.hwp
zig/hwp5-probe "$fixture" 1000
rust/target/release/hwp5-rust-spike probe "$fixture" 1000
rust/target/release/hwp5-rust-spike full "$fixture" 100
```

`hyperfine`이 설치되어 있으면 프로세스 시작 비용을 줄이기 위해 충분한 반복 횟수로 비교한다.

```sh
hyperfine --warmup 2 \
  "zig/hwp5-probe \"$fixture\" 1000" \
  "rust/target/release/hwp5-rust-spike probe \"$fixture\" 1000"
```

이 spike의 속도 결과는 semantic parser 전체의 성능이나 필드 지원률을 의미하지 않는다. Zig의 장점을 판단하려면 이 범위가 아니라 동일한 canonical model과 HWPX 경로까지 구현한 뒤 다시 측정해야 한다.

## 2026-09-05 측정 결과

Apple Silicon macOS에서 `hyperfine --warmup 3 --runs 12`로 측정했다. 입력 파일은 프로세스 밖에서 한 번 읽고, 각 프로세스 내부에서 반복 파싱했다.

| 입력 / 모드 | Zig ReleaseFast | Zig ReleaseSafe | Rust release |
| --- | ---: | ---: | ---: |
| `example.hwp`, probe 1000회 | 27.7 ms | 35.1 ms | 37.9 ms |
| `software.hwp`, probe 100회 | 9.4 ms | 11.2 ms | 10.1 ms |

일반 HWP fixture 48개 중 45개에서 Rust probe와 checksum이 일치했다. 나머지 3개는 암호화 1개와 배포용 `ViewText` 2개로, Zig spike에서 아직 지원하지 않는다. 이는 Rust full parser와 Zig semantic parser의 비교가 아니므로 언어 전환의 근거로 단독 사용하면 안 된다.
