const structure = @import("structure.zig");

/// Raw fourth-byte evidence for BI_RGB32. This byte is not interpreted as alpha.
pub const Report = struct {
    images: usize = 0,
    zero: usize = 0,
    ff: usize = 0,
    other: usize = 0,
};

/// The input view has already validated row stride and pixel extent.
pub fn inspect(view: structure.View) Report {
    if (view.header.bit_count != 32 or view.header.compression != .rgb) return .{};
    var result: Report = .{ .images = 1 };
    for (0..view.header.height) |y| {
        const row = view.pixels[y * view.stride ..][0..view.stride];
        for (0..view.header.width) |x| {
            const value = row[x * 4 + 3];
            if (value == 0) result.zero += 1 else if (value == 255) result.ff += 1 else result.other += 1;
        }
    }
    return result;
}
