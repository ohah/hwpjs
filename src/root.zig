//! Zig library entrypoint: bounded binary reading and CFB container reading.
pub const Reader = @import("binary/reader.zig").Reader;
pub const cfb = @import("cfb/reader.zig");

test {
    _ = @import("binary/reader.zig");
    _ = @import("cfb/tests.zig");
    _ = @import("cfb/mutation_tests.zig");
    _ = @import("cfb/extended_tests.zig");
    _ = @import("wasm/search_snapshot.zig");
}
