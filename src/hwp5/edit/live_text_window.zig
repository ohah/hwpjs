//! HWP5 전용 bounded 읽기. 반환 버퍼만 소유하고 문단/token borrow는 보관하지 않는다.
const std = @import("std");
const model = @import("../../model/document.zig");
pub const max_units: u32 = 4096;
pub const Window = struct {
    bytes: []u8,
    source_node: ?u32,
    parent_node: ?u32,
    text_present: bool,
    total_units: u32,
    start_unit: u32,
    end_unit: u32,
    pub fn deinit(self: *Window, a: std.mem.Allocator) void {
        a.free(self.bytes);
        self.* = undefined;
    }
};
fn range(start: u32, end: u32, total: u32) !void {
    if (start > end or end > total) return error.InvalidTextPosition;
    if (end - start > max_units) return error.LimitExceeded;
}
fn describe(p: model.Paragraph, start: u32, end: u32, total: u32, bytes: []u8) Window {
    return .{ .bytes = bytes, .source_node = p.source_node, .parent_node = p.parent_node, .text_present = p.text_present, .total_units = total, .start_unit = start, .end_unit = end };
}
fn canonicalLength(p: model.Paragraph) !u32 {
    if (p.tokens.len == 0) {
        if (p.declared_units > 1) return error.SourceBindingMismatch;
        return 0; // text_present와 payload 부재를 유지. implicit CR 생성 금지.
    }
    if (!p.text_present) return error.SourceBindingMismatch;
    var total: usize = 0;
    for (p.tokens, 0..) |token, i| {
        if (token.encoding != .utf16le or token.raw.len % 2 != 0 or token.start_unit != total) return error.SourceBindingMismatch;
        if (token.kind == .control and !(i + 1 == p.tokens.len and token.raw.len == 2 and std.mem.readInt(u16, token.raw[0..2], .little) == 13)) return error.UnsupportedTextWindowParagraph;
        total = try std.math.add(usize, total, token.raw.len / 2);
    }
    const last = p.tokens[p.tokens.len - 1];
    if (last.kind != .control or last.raw.len != 2 or std.mem.readInt(u16, last.raw[0..2], .little) != 13) return error.UnsupportedParagraphTerminator;
    if (total != p.declared_units) return error.SourceBindingMismatch;
    return std.math.cast(u32, total) orelse error.LimitExceeded;
}
fn unitAt(p: model.Paragraph, at: u32) !u16 {
    for (p.tokens) |token| {
        if (at >= token.start_unit and at - token.start_unit < token.raw.len / 2) {
            const i = @as(usize, at - token.start_unit) * 2;
            return std.mem.readInt(u16, token.raw[i..][0..2], .little);
        }
    }
    return error.InvalidTextPosition;
}
fn boundary(p: model.Paragraph, at: u32, total: u32) !void {
    if (at > total) return error.InvalidTextPosition;
    if (at > 0 and at < total) {
        const before = try unitAt(p, at - 1);
        const after = try unitAt(p, at);
        if (before >= 0xd800 and before <= 0xdbff and after >= 0xdc00 and after <= 0xdfff) return error.SplitSurrogatePair;
    }
}
pub fn canonical(a: std.mem.Allocator, p: model.Paragraph, start: u32, end: u32) !Window {
    const total = try canonicalLength(p);
    try range(start, end, total);
    try boundary(p, start, total);
    try boundary(p, end, total);
    const out = try a.alloc(u8, @as(usize, end - start) * 2);
    for (p.tokens) |token| {
        const first = @max(start, token.start_unit);
        const last = @min(end, token.start_unit + @as(u32, @intCast(token.raw.len / 2)));
        if (first >= last) continue;
        const from = @as(usize, first - token.start_unit) * 2;
        const to = @as(usize, first - start) * 2;
        const count = @as(usize, last - first) * 2;
        @memcpy(out[to..][0..count], token.raw[from..][0..count]);
    }
    return describe(p, start, end, total, out);
}
pub fn gap(a: std.mem.Allocator, p: model.Paragraph, backing: *@import("live_text_backing.zig").Backing, start: u32, end: u32) !Window {
    const total = std.math.cast(u32, backing.len()) orelse return error.LimitExceeded;
    if (!p.text_present or p.declared_units != total or p.source_node != backing.source_node or p.parent_node != backing.parent_node) return error.SourceBindingMismatch;
    try range(start, end, total);
    // p.tokens는 stale projection일 수 있다. 여기서는 읽거나 반환하지 않는다.
    return describe(p, start, end, total, try backing.copyWindow(a, start, end));
}
