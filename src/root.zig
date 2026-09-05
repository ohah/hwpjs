//! Zig library entrypoint: bounded binary/CFB operations and HWP5 framing.
pub const Reader = @import("binary/reader.zig").Reader;
pub const cfb = @import("cfb/reader.zig");
pub const hwp5 = @import("hwp5/root.zig");
pub const raw_deflate = @import("compression/raw_deflate.zig");

test {
    _ = @import("binary/reader.zig");
    _ = @import("hwp5/header_tests.zig");
    _ = @import("hwp5/record_tests.zig");
    _ = @import("hwp5/docinfo/tests.zig");
    _ = @import("hwp5/docinfo/resource_tests.zig");
    _ = @import("hwp5/compression_tests.zig");
    _ = @import("cfb/tests.zig");
    _ = @import("cfb/mutation_tests.zig");
    _ = @import("cfb/extended_tests.zig");
    _ = @import("cfb/writer_tests.zig");
    _ = @import("wasm/search_snapshot.zig");
    _ = @import("wasm/document_wire.zig");
}
