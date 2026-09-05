//! Zig implementation entrypoint. Document parsing/writing is not implemented yet.
pub const Reader = @import("binary/reader.zig").Reader;

test {
    _ = @import("binary/reader.zig");
}
