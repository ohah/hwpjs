// Only the three manifest-pinned package surveys are selected by build.zig.
test {
    _ = @import("hwpx/package_corpus_tests.zig");
}
