//! Small deterministic synthetic Company/control document; no external bytes.
const std = @import("std");
const f = @import("../document/test_fixture.zig");
const id = @import("../body/control_rules.zig").id;
pub const Case = enum { positive, local_hyperlink, orphan_start, orphan_end, duplicate_id, cross_paragraph_end };
pub const version: @import("../version.zig").Version = .{ .raw = 0x05000204 };
fn marker(code: u16, control: u32) [16]u8 {
    var b = @as([16]u8, @splat(0));
    f.put(&b, 0, u16, code);
    f.put(&b, 2, u32, control);
    f.put(&b, 14, u16, code);
    return b;
}
fn field(a: std.mem.Allocator, out: *std.ArrayList(u8), control: u32, instance: u32, company: bool) !void {
    const command = if (company) "$Company" else "synthetic";
    const b = try a.alloc(u8, 15 + command.len * 2 + (if (company) @as(usize, 4) else 0));
    defer a.free(b);
    @memset(b, 0);
    f.put(b, 0, u32, control);
    b[8] = if (company) 8 else 0;
    f.put(b, 9, u16, @intCast(command.len));
    for (command, 0..) |c, i| f.put(b, 11 + i * 2, u16, c);
    f.put(b, 11 + command.len * 2, u32, instance);
    try f.frame(a, out, 71, 1, b);
}
fn paragraph(a: std.mem.Allocator, out: *std.ArrayList(u8), text: []const u8, mask: u32, instance: u32) !void {
    var h = @as([22]u8, @splat(0));
    f.put(&h, 0, u32, @intCast(text.len / 2));
    f.put(&h, 4, u32, mask);
    f.put(&h, 12, u16, 1);
    f.put(&h, 18, u32, instance);
    try f.frame(a, out, 66, 0, &h);
    try f.frame(a, out, 67, 1, text);
    try f.frame(a, out, 68, 1, &(@as([8]u8, @splat(0))));
}
fn plain(a: std.mem.Allocator, out: *std.ArrayList(u8), value: []const u8, instance: u32) !void {
    const b = try a.alloc(u8, (value.len + 1) * 2);
    defer a.free(b);
    for (value, 0..) |c, i| f.put(b, i * 2, u16, c);
    f.put(b, value.len * 2, u16, 13);
    try paragraph(a, out, b, 0, instance);
}
pub fn section(a: std.mem.Allocator, case: Case) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var section_text: [18]u8 = undefined;
    @memcpy(section_text[0..16], &marker(2, id("secd")));
    f.put(&section_text, 16, u16, 13);
    try paragraph(a, &out, &section_text, 1 << 2, 101);
    var ctrl = @as([30]u8, @splat(0));
    f.put(&ctrl, 0, u32, id("secd"));
    try f.frame(a, &out, 71, 1, &ctrl);
    try f.frame(a, &out, 73, 2, &(@as([40]u8, @splat(0))));
    try plain(a, &out, "Before", 102);
    var company_text: [34]u8 = undefined;
    @memcpy(company_text[0..16], &marker(3, id("%usr")));
    @memcpy(company_text[16..32], &marker(4, (id("%usr") & 0x00ffffff) | 0x08000000));
    f.put(&company_text, 32, u16, 13);
    if (case == .cross_paragraph_end) {
        f.put(&company_text, 16, u16, 13);
        try paragraph(a, &out, company_text[0..18], 1 << 3, 103);
    } else try paragraph(a, &out, &company_text, (1 << 3) | (1 << 4), 103);
    try field(a, &out, id("%usr"), 1001, true);
    if (case == .cross_paragraph_end) {
        var end: [18]u8 = undefined;
        @memcpy(end[0..16], &marker(4, (id("%usr") & 0x00ffffff) | 0x08000000));
        f.put(&end, 16, u16, 13);
        try paragraph(a, &out, &end, 1 << 4, 104);
    } else try plain(a, &out, "After", 104);
    if (case == .positive or case == .cross_paragraph_end) {
        try plain(a, &out, "Control", 105);
    } else if (case == .orphan_end) {
        var text: [18]u8 = undefined;
        @memcpy(text[0..16], &marker(4, id("%hlk") & 0x00ffffff));
        f.put(&text, 16, u16, 13);
        try paragraph(a, &out, &text, 1 << 4, 105);
    } else {
        var text: [36]u8 = undefined;
        @memcpy(text[0..16], &marker(3, id("%hlk")));
        f.put(&text, 16, u16, 'X');
        @memcpy(text[18..34], &marker(4, id("%hlk") & 0x00ffffff));
        f.put(&text, 34, u16, 13);
        try paragraph(a, &out, &text, (1 << 3) | (1 << 4), 105);
        if (case != .orphan_start) try field(a, &out, id("%hlk"), if (case == .duplicate_id) 1001 else 1002, false);
    }
    return out.toOwnedSlice(a);
}
pub fn build(a: std.mem.Allocator, case: Case) ![]u8 {
    var h = f.header();
    f.put(&h, 32, u32, version.raw);
    const info = try f.docInfo(a, 1);
    defer a.free(info);
    const body = try section(a, case);
    defer a.free(body);
    return @import("../../cfb/writer.zig").write(a, &.{ .{ .name = "Root Entry", .kind = 5 }, .{ .name = "FileHeader", .parent = 0, .content = &h }, .{ .name = "DocInfo", .parent = 0, .content = info }, .{ .name = "BodyText", .parent = 0, .kind = 1 }, .{ .name = "Section0", .parent = 3, .content = body } }, .{});
}
