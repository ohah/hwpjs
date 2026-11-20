//! Declared product regressions. This file has not been compiled or executed.
const std = @import("std");
const editor = @import("editor_session.zig");
const histories = @import("editor_history.zig");
const api = @import("note_create.zig");
const owner = @import("note_create_owner.zig");
const caret_api = @import("note_create_caret.zig");
const fixtures = @import("note_delete_fixtures.zig");
const Kind = @import("note_bodies.zig").Kind;
const a = std.testing.allocator;
const format: @import("note_create_profile.zig").Format = .{ .number_type = "DIGIT", .user_char = "", .prefix_char = "", .suffix_char = ")", .superscript = false };
pub fn expectedError(expected: anyerror, result: anytype) !void {
    if (result) |_| return error.TestExpectedError else |err| {
        if (err == error.OutOfMemory) return err;
        try std.testing.expectEqual(expected, err);
    }
}
pub fn physicalHost(session: *const editor.Session, section_index: usize) !usize {
    const section = &session.sections[section_index];
    var node: ?usize = null;
    for (section.tree.elements) |element| if (element.is(@import("document_xml.zig").paragraph_uri, "secPr")) {
        node = section.tree.elements[element.parent.?].parent;
        break;
    };
    var view = try @import("display_current_paragraphs.zig").read(session.allocator, section, session.options);
    defer view.deinit(session.allocator);
    for (view.paragraphs, 0..) |p, index| if (p.template_element == node) return std.math.add(usize, section.first_paragraph, index);
    return error.MissingTestHost;
}
pub fn shape(kind: Kind) @import("note_create_policy.zig").Shape {
    // Explicit synthetic input matching the observed official UI policy values;
    // the product has no guessed policy/resource default.
    return .{ .format = format, .line_length = if (kind == .foot) -1 else -4, .line_type = "SOLID", .line_width = "0.12 mm", .line_color = "#000000", .between_notes = if (kind == .foot) 283 else 0, .below_line = 567, .above_line = 850, .start = 1, .place = if (kind == .foot) "EACH_COLUMN" else "END_OF_DOCUMENT", .beneath_text = false };
}
pub fn request(observation: *const owner.Observation, kind: Kind, receipt: *caret_api.Receipt) api.Request {
    return .{ .lease = observation.lease, .target = observation.target(), .kind = kind, .resources = .{ .paragraph = 0, .character = 0, .style = 0 }, .format = format, .body = "새😀<&>\r\n본문", .receipt_out = receipt };
}
pub fn command(input: *const api.Request) histories.Command {
    return .{ .kind = .note_create, .section = input.target.section, .paragraph = input.target.paragraph, .start = input.target.unit, .deleted = 0, .inserted = "", .note_create = input };
}
pub fn otherParts(allocator: std.mem.Allocator, before: []const u8, after: []const u8) !void {
    var b = try @import("../zip/archive.zig").open(allocator, before, .{});
    defer b.deinit();
    var c = try @import("../zip/archive.zig").open(allocator, after, .{});
    defer c.deinit();
    try std.testing.expectEqual(b.entries.len, c.entries.len);
    for (b.entries) |entry| {
        if (std.mem.startsWith(u8, entry.name, "Contents/section")) continue;
        const old = try b.decode(entry, 4_000_000);
        defer allocator.free(old);
        const new = try c.decode(c.find(entry.name) orelse return error.TestMissingPart, 4_000_000);
        defer allocator.free(new);
        try std.testing.expectEqualSlices(u8, old, new);
    }
}
