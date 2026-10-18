//! Small decoded-section fixture; not a complete HWP container.
const std = @import("std");
const f = @import("../document/test_fixture.zig");
pub const version: @import("../version.zig").Version = .{ .raw = 0x05000000 };

pub fn bytes(a: std.mem.Allocator) ![]u8 {
    return build(a, false);
}
pub fn balanced(a: std.mem.Allocator) ![]u8 {
    return build(a, true);
}
fn build(a: std.mem.Allocator, closed: bool) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var header = @as([22]u8, @splat(0));
    f.put(&header, 0, u32, 10);
    f.put(&header, 4, u32, 1 << 16);
    f.put(&header, 12, u16, 1);
    try f.frame(a, &out, 66, 0, &header);
    var text = @as([36]u8, @splat(0));
    f.put(&text, 0, u16, 16);
    f.put(&text, 2, u32, @import("../body/control_rules.zig").id("head"));
    f.put(&text, 14, u16, 16);
    f.put(&text, 16, u16, 'A');
    f.put(&text, 18, u16, 13);
    try f.frame(a, &out, 67, 1, text[0..20]);
    try f.frame(a, &out, 68, 1, &(@as([8]u8, @splat(0))));
    var owner = @as([8]u8, @splat(0));
    f.put(&owner, 0, u32, @import("../body/control_rules.zig").id("head"));
    try f.frame(a, &out, 71, 1, &owner);
    var list = @as([18]u8, @splat(0));
    f.put(&list, 0, u16, 1);
    try f.frame(a, &out, 72, 2, &list);
    f.put(&header, 4, u32, 1 << 3);
    f.put(&header, 0, u32, if (closed) 18 else 10);
    try f.frame(a, &out, 66, 2, &header);
    f.put(&text, 0, u16, 3);
    f.put(&text, 2, u32, @import("../body/control_rules.zig").id("%clk"));
    f.put(&text, 14, u16, 3);
    f.put(&text, 16, u16, 'B');
    if (closed) {
        f.put(&text, 18, u16, 4);
        f.put(&text, 20, u32, 0x00636c6b);
        f.put(&text, 32, u16, 4);
        f.put(&text, 34, u16, 13);
    }
    try f.frame(a, &out, 67, 3, text[0..if (closed) @as(usize, 36) else 20]);
    try f.frame(a, &out, 68, 3, &(@as([8]u8, @splat(0))));
    var field = @as([15]u8, @splat(0));
    f.put(&field, 0, u32, @import("../body/control_rules.zig").id("%clk"));
    f.put(&field, 11, u32, 1);
    try f.frame(a, &out, 71, 3, &field);
    return out.toOwnedSlice(a);
}
