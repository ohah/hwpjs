//! Plain UTF-16 paragraph content and scalar boundaries shared by editors.
const std = @import("std");
const model = @import("../../model/document.zig");
const scalars = @import("../../text/scalars.zig");

pub fn textBytes(a: std.mem.Allocator, p: model.Paragraph) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for (p.tokens) |token| try out.appendSlice(a, token.raw);
    return out.toOwnedSlice(a);
}

/// Editing view only: observed omitted/zero-length empty text has an implicit
/// terminator. Raw copyText and no-op saves retain the original absence.
pub fn editableTextBytes(a: std.mem.Allocator, p: model.Paragraph) ![]u8 {
    if (p.tokens.len == 0 and p.declared_units <= 1) return a.dupe(u8, &.{ 13, 0 });
    return textBytes(a, p);
}

pub fn boundary(bytes: []const u8, unit: u32) !void {
    if (unit > bytes.len / 2) return error.InvalidTextPosition;
    const at = @as(usize, unit) * 2;
    if (at > 0 and at < bytes.len) {
        const previous = std.mem.readInt(u16, bytes[at - 2 ..][0..2], .little);
        const next = std.mem.readInt(u16, bytes[at..][0..2], .little);
        if (previous >= 0xd800 and previous <= 0xdbff and next >= 0xdc00 and next <= 0xdfff)
            return error.SplitSurrogatePair;
    }
}

pub fn validatePlain(bytes: []const u8) !void {
    if (bytes.len < 2 or std.mem.readInt(u16, bytes[bytes.len - 2 ..][0..2], .little) != 13)
        return error.UnsupportedParagraphTerminator;
    var offset: usize = 0;
    while (try scalars.read(bytes[0 .. bytes.len - 2], offset, .utf16le)) |c| {
        if (c.value < 32) return error.UnsupportedTextControl;
        offset = c.end;
    }
}
