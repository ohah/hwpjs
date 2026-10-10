//! Observed %xrf UTF-16 command envelope. No target resolution or evaluation.
const std = @import("std");
pub const Target = union(enum) { numeric: u32, name: []const u8 };
pub const ObjectKind = enum(u32) { table = 0, picture = 1, equation = 2, footnote = 3, endnote = 4, outline = 5, bookmark = 6 };
pub const Content = enum(u32) { page = 0, number_or_name = 1, text = 2, relative_position = 3 };
pub const OpenMode = enum(u32) { current = 0, tab = 1, window = 2 };
pub const TargetSpace = enum { object_instance, note_index, outline, bookmark_name };
pub const Semantics = struct {
    object: ObjectKind,
    content: Content,
    hyperlink: bool,
    open_mode: OpenMode,
    pub fn targetSpace(self: Semantics) TargetSpace {
        return switch (self.object) {
            .table, .picture, .equation => .object_instance,
            .footnote, .endnote => .note_index,
            .outline => .outline,
            .bookmark => .bookmark_name,
        };
    }
};
pub const View = struct {
    target: Target,
    /// Borrowed external-document spelling. Never open or fetch this path.
    external_document: ?[]const u8,
    /// Preserve raw numeric slots independently of supported semantic values.
    options: [4]u32,
    raw: []const u8,

    pub fn semantics(self: View) !Semantics {
        const object = std.enums.fromInt(ObjectKind, self.options[0]) orelse return error.UnsupportedCrossReferenceObjectKind;
        const content = std.enums.fromInt(Content, self.options[1]) orelse return error.UnsupportedCrossReferenceContent;
        if (self.options[2] > 1) return error.UnsupportedCrossReferenceHyperlink;
        const open_mode = std.enums.fromInt(OpenMode, self.options[3]) orelse return error.UnsupportedCrossReferenceOpenMode;
        if ((object == .footnote or object == .endnote) and content == .text) return error.UnsupportedCrossReferenceContent;
        if ((object == .bookmark) != (self.target == .name)) return error.UnsupportedCrossReferenceTargetKind;
        return .{ .object = object, .content = content, .hyperlink = self.options[2] == 1, .open_mode = open_mode };
    }

    pub fn parse(bytes: []const u8) !View {
        if (bytes.len % 2 != 0) return error.UnexpectedEnd;
        var separator: usize = 0;
        while (separator < bytes.len and unit(bytes, separator) != '?') : (separator += 2) {}
        if (separator == bytes.len) return error.UnsupportedCrossReferenceCommand;
        const target_start = separator + 2;
        var at: usize = target_start;
        while (at < bytes.len and unit(bytes, at) != ';') : (at += 2) {}
        if (at == target_start or at == bytes.len) return error.UnsupportedCrossReferenceCommand;
        const target_bytes = bytes[target_start..at];
        const target: Target = if (unit(target_bytes, 0) == '#') .{ .numeric = try decimal(target_bytes[2..]) } else .{ .name = target_bytes };
        var options: [4]u32 = undefined;
        for (&options, 0..) |*option, index| {
            const begin = at + 2;
            at = begin;
            while (at < bytes.len and unit(bytes, at) != ';') : (at += 2) {}
            if (at == bytes.len and index != 3) return error.UnsupportedCrossReferenceCommand;
            option.* = try decimal(bytes[begin..at]);
        }
        if (at != bytes.len and at + 2 != bytes.len) return error.UnsupportedCrossReferenceCommand;
        return .{ .target = target, .external_document = if (separator == 0) null else bytes[0..separator], .options = options, .raw = bytes };
    }
};

fn unit(bytes: []const u8, at: usize) u16 {
    return std.mem.readInt(u16, bytes[at..][0..2], .little);
}
fn decimal(bytes: []const u8) !u32 {
    if (bytes.len == 0) return error.UnsupportedCrossReferenceCommand;
    var value: u32 = 0;
    var at: usize = 0;
    while (at < bytes.len) : (at += 2) {
        const digit = unit(bytes, at);
        if (digit < '0' or digit > '9') return error.UnsupportedCrossReferenceCommand;
        value = std.math.mul(u32, value, 10) catch return error.CrossReferenceIntegerOverflow;
        value = std.math.add(u32, value, digit - '0') catch return error.CrossReferenceIntegerOverflow;
    }
    return value;
}
fn wire(comptime text: []const u8) [text.len * 2]u8 {
    var bytes: [text.len * 2]u8 = @splat(0);
    for (text, 0..) |c, index| bytes[index * 2] = c;
    return bytes;
}

test "cross reference documented external and final delimiter variants preserve supported semantics" {
    const local = try View.parse(&wire("?#2043988345;0;0;0;0"));
    try std.testing.expect(local.external_document == null);
    try std.testing.expectEqual(Semantics{ .object = .table, .content = .page, .hyperlink = false, .open_mode = .current }, try local.semantics());
    const note = try View.parse(&wire("?#1;3;1;0;0"));
    try std.testing.expectEqual(ObjectKind.footnote, (try note.semantics()).object);
    try std.testing.expectEqual(TargetSpace.note_index, (try note.semantics()).targetSpace());
    try std.testing.expectEqual(TargetSpace.object_instance, (try local.semantics()).targetSpace());
    const bytes = wire("C:\\Hnc\\Hwp70\\Readme.Hwp?#204399566;1;2;1;2");
    const external = try View.parse(&bytes);
    try std.testing.expectEqualSlices(u8, &wire("C:\\Hnc\\Hwp70\\Readme.Hwp"), external.external_document.?);
    try std.testing.expectEqual(@intFromPtr(&bytes), @intFromPtr(external.external_document.?.ptr));
    try std.testing.expectEqual(Semantics{ .object = .picture, .content = .text, .hyperlink = true, .open_mode = .window }, try external.semantics());
    const bookmark = try View.parse(&wire("?name;6;2;0;0;"));
    try std.testing.expectEqual(ObjectKind.bookmark, (try bookmark.semantics()).object);
    try std.testing.expectEqual(Content.text, (try bookmark.semantics()).content);
    inline for (.{ .{ "?name;7;0;0;0;", error.UnsupportedCrossReferenceObjectKind }, .{ "?name;6;4;0;0;", error.UnsupportedCrossReferenceContent }, .{ "?name;6;0;2;0;", error.UnsupportedCrossReferenceHyperlink }, .{ "?name;6;0;0;3;", error.UnsupportedCrossReferenceOpenMode }, .{ "?#1;3;2;0;0;", error.UnsupportedCrossReferenceContent }, .{ "?#1;6;1;0;0;", error.UnsupportedCrossReferenceTargetKind } }) |case| {
        const view = try View.parse(&wire(case[0]));
        try std.testing.expectError(case[1], view.semantics());
    }
}
test "cross reference observed envelope preserves target and uninterpreted options" {
    const bytes = wire("?#2038324100;0;0;1;0;");
    const v = try View.parse(&bytes);
    try std.testing.expectEqual(@as(u32, 2038324100), v.target.numeric);
    try std.testing.expectEqual([4]u32{ 0, 0, 1, 0 }, v.options);
    try std.testing.expectEqual(@intFromPtr(&bytes), @intFromPtr(v.raw.ptr));
    const name = wire("? name ;6;0;1;0;");
    const named = try View.parse(&name);
    try std.testing.expectEqualSlices(u8, &wire(" name "), named.target.name);
    try std.testing.expectEqual(@intFromPtr(&name) + 2, @intFromPtr(named.target.name.ptr));
    const limit = try View.parse(&wire("?#4294967295;4294967295;0;0;0;"));
    try std.testing.expectEqual(std.math.maxInt(u32), limit.target.numeric);
}
test "cross reference envelope rejects missing extra malformed and overflowing numeric fields" {
    try std.testing.expectError(error.UnexpectedEnd, View.parse(&.{'?'}));
    inline for (.{ "", "?", "?;0;0;1;0;", "?#;0;0;1;0;", "?#+1;0;0;1;0;", "?# 1;0;0;1;0;", "?x;0;0;1;0;tail", "?x;0;0;1;0;0;", "?x;;0;1;0;", "?x;-1;0;1;0;", "?x;0;0;1;" }) |text| {
        try std.testing.expectError(error.UnsupportedCrossReferenceCommand, View.parse(&wire(text)));
    }
    inline for (.{ "?#4294967296;0;0;1;0;", "?x;99999999999;0;1;0;" }) |text| {
        try std.testing.expectError(error.CrossReferenceIntegerOverflow, View.parse(&wire(text)));
    }
}

test "cross reference envelope rejects every truncation and non ASCII numeric unit" {
    const original = wire("?#2038324100;0;0;1;0;");
    for (0..original.len) |length| {
        if (length == original.len - 2) continue; // Documented complete envelope without final delimiter.
        if (View.parse(original[0..length])) |_| return error.TestExpectedError else |err| {
            try std.testing.expect(err == error.UnexpectedEnd or err == error.UnsupportedCrossReferenceCommand);
        }
    }
    var changed = original;
    // Low byte remains an ASCII digit; high byte must still be validated.
    changed[7] = 1;
    try std.testing.expectError(error.UnsupportedCrossReferenceCommand, View.parse(&changed));
}
