//! Exact observed field end IDs; never accept an arbitrary high-byte wildcard.
const controls = @import("control_rules.zig");
pub fn matches(begin: u32, end: u32) bool {
    if (end == begin or end == (begin & 0x00ffffff)) return true;
    if (begin == controls.id("%fmu")) return end == ((begin & 0x00ffffff) | 0x08000000);
    if (begin == controls.id("%clk")) return end == ((begin & 0x00ffffff) | 0x09000000);
    if (begin == controls.id("%bmk")) return end == ((begin & 0x00ffffff) | 0x02000000);
    return false;
}

test "field end identity permits only exact observed kind variants" {
    const t = @import("std").testing;
    inline for (.{ .{ "%clk", @as(u32, 9) }, .{ "%fmu", @as(u32, 8) }, .{ "%bmk", @as(u32, 2) } }) |case| {
        const id = controls.id(case[0]);
        try t.expect(matches(id, id));
        try t.expect(matches(id, id & 0x00ffffff));
        for (1..256) |high| {
            const end = (id & 0x00ffffff) | (@as(u32, @intCast(high)) << 24);
            try t.expectEqual(high == case[1] or high == '%', matches(id, end));
        }
        try t.expect(!matches(id, (id & 0x00ffffff) ^ 1));
    }
    try t.expect(!matches(controls.id("%hlk"), (controls.id("%hlk") & 0x00ffffff) | 0x09000000));
}
