#!/bin/sh
set -eu
cd "$(dirname "$0")"
src=../../../../reference/libolecf-20240427
deps='libcerror libcdata libclocale libcnotify libcsplit libuna libcfile libcpath libbfio libfdatetime libfguid libfole libfvalue libfwps'
# Configure first; see README. Build libraries only (CLI requires POSIX signals).
for dep in $deps libolecf; do
    make -C "$src/$dep" -j8
done
set -- -I"$src/common" -I"$src/include" -I"$src/libolecf"
for dep in $deps; do set -- "$@" -I"$src/$dep"; done
set -- "$@" "$src/libolecf/.libs/libolecf.a"
for dep in $deps; do set -- "$@" "$src/$dep/.libs/$dep.a"; done
zig cc -target wasm32-wasi -O2 -DHAVE_CONFIG_H "$@" probe.c \
    -mexec-model=reactor -Wl,--export=extract_stream \
    -Wl,--export=malloc -Wl,--export=free -Wl,--initial-memory=67108864 -Wl,--strip-all \
    -o probe.wasm
