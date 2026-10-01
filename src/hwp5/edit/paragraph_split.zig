//! Owned split drafts. Session topology and structural serialization are separate.
const std = @import("std");
const model = @import("../../model/document.zig");
const clone = @import("../../model/clone.zig");
const plain = @import("plain_text.zig");
const Version = @import("../version.zig").Version;

pub const Draft = struct {
    left: model.Paragraph,
    right: model.Paragraph,
    pub fn deinit(self: *Draft, a: std.mem.Allocator) void {
        self.left.deinit(a);
        self.right.deinit(a);
        self.* = undefined;
    }
};

/// Caller must reserve new_id against the entire current document.
/// Control relocation and cross-paragraph range semantics require later adapters.
pub fn prepare(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, at: u32, new_id: u32, char_count: usize) !Draft {
    const template = if (p.source_node == null) p.header_template orelse return error.MissingParagraphTemplate else try p.originalNode();
    if (new_id == 0 or new_id == p.instance_id) return error.InvalidParagraphInstanceId;
    for (p.tokens) |token| {
        if (token.kind == .control and (token.raw.len != 2 or std.mem.readInt(u16, token.raw[0..2], .little) != 13)) return error.UnsupportedStructuralControl;
    }
    if (p.field_attributes != null or p.formula_results != null) return error.UnsupportedStructuralControl;
    if (p.range_tags) |ranges| if (ranges.len != 0) return error.UnsupportedRangeSemantics;
    const bytes = try @import("plain_text_content.zig").editableTextBytes(a, p);
    defer a.free(bytes);
    try @import("plain_text_content.zig").validatePlain(bytes);
    const end: u32 = @intCast(bytes.len / 2 - 1);
    try @import("control_boundaries.zig").validate(bytes, at, at);
    if (at > end) return error.InvalidTextPosition;
    var left = try clone.paragraph(a, p);
    errdefer left.deinit(a);
    var right = try clone.paragraph(a, p);
    errdefer right.deinit(a);
    try plain.apply(a, source, version, &left, .{ .section = 0, .paragraph = 0, .start_unit = at, .end_unit = end, .utf8 = "" }, char_count);
    try plain.apply(a, source, version, &right, .{ .section = 0, .paragraph = 0, .start_unit = 0, .end_unit = at, .utf8 = "" }, char_count);
    if (right.tokens.len == 0) {
        const tokens = try a.alloc(model.Token, 1);
        errdefer a.free(tokens);
        const terminator = try a.dupe(u8, &.{ 13, 0 });
        tokens[0] = .{ .start_unit = 0, .kind = .control, .encoding = .utf16le, .raw = terminator };
        a.free(right.tokens);
        right.tokens = tokens;
        right.text_present = true;
        right.declared_units = 1;
    }
    right.source_node = null;
    right.header_template = template;
    right.instance_id = new_id;
    right.deferred_direct_records = 0; // Source eligibility excluded opaque content; layout caches are not copied.
    return .{ .left = left, .right = right };
}

/// Commit only after both drafts and the larger array are fully allocated.
/// Caller must validate document-wide ID and logical owner constraints.
pub fn apply(a: std.mem.Allocator, section: *model.Section, source: []const u8, version: Version, paragraph: usize, at: u32, new_id: u32, char_count: usize) !void {
    if (paragraph >= section.paragraphs.len) return error.InvalidParagraphIndex;
    for (section.paragraphs) |p| if (p.instance_id == new_id) return error.InvalidParagraphInstanceId;
    var draft = try prepare(a, source, version, section.paragraphs[paragraph], at, new_id, char_count);
    var transferred = false;
    defer if (!transferred) draft.deinit(a);
    const count = std.math.add(usize, section.paragraphs.len, 1) catch return error.LimitExceeded;
    const next = try a.alloc(model.Paragraph, count);
    @memcpy(next[0..paragraph], section.paragraphs[0..paragraph]);
    next[paragraph] = draft.left;
    next[paragraph + 1] = draft.right;
    @memcpy(next[paragraph + 2 ..], section.paragraphs[paragraph + 1 ..]);
    section.paragraphs[paragraph].deinit(a);
    a.free(section.paragraphs);
    section.paragraphs = next;
    transferred = true;
}

test "paragraph split drafts preserve original model runs provenance and every allocation failure" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var file = try @import("../text_source.zig").Source.open(a, input);
    defer file.deinit();
    const raw = try file.decodeSection(a, 0);
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, file.header.version(), &.{raw});
    defer document.deinit(a);
    const p = document.sections[0].paragraphs[1];
    const before = try plain.textBytes(a, p);
    defer a.free(before);
    var draft = try prepare(a, raw, file.header.version(), p, 1, 0xfffffffe, 1000);
    defer draft.deinit(a);
    const left = try plain.textBytes(a, draft.left);
    defer a.free(left);
    const right = try plain.textBytes(a, draft.right);
    defer a.free(right);
    try std.testing.expectEqualSlices(u8, before[0..2], left[0 .. left.len - 2]);
    try std.testing.expectEqualSlices(u8, before[2..], right);
    try std.testing.expectEqual(p.source_node, draft.left.source_node);
    try std.testing.expect(draft.right.source_node == null);
    try std.testing.expectEqual(p.source_node, draft.right.header_template);
    try std.testing.expectEqual(p.instance_id, draft.left.instance_id);
    try std.testing.expectEqual(@as(u32, 0xfffffffe), draft.right.instance_id);
    try std.testing.expectEqual(p.style_id, draft.right.style_id);
    try std.testing.expectEqual(p.parent_node, draft.right.parent_node);
    var record_cursor = @import("../record.zig").Iterator.init(raw, .{});
    var template_record: @import("../record.zig").Record = undefined;
    var record_index: usize = 0;
    while (try record_cursor.next()) |record| : (record_index += 1) {
        if (record_index == p.source_node.?) {
            template_record = record;
            break;
        }
    }
    var generated: std.ArrayList(u8) = .empty;
    defer generated.deinit(a);
    try @import("paragraph_records.zig").append(a, &generated, template_record, p.source_node.?, draft.right, file.header.version(), 1000, true, 4_000_000);
    var saved = @import("../record.zig").Iterator.init(generated.items, .{});
    const new_header = (try saved.next()).?;
    const parsed = try @import("../body/paragraph_header.zig").Header.parse(new_header.payload, file.header.version());
    try std.testing.expectEqual(@as(u32, 0xfffffffe), parsed.instance_id);
    try std.testing.expect(parsed.countHighBit());
    try std.testing.expectEqual(@as(u8, 0), parsed.break_flags);
    try std.testing.expectEqualSlices(u8, right, (try saved.next()).?.payload);
    try std.testing.expectEqual(@as(u10, 68), (try saved.next()).?.tag);
    try std.testing.expect(try saved.next() == null);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, record: @import("../record.zig").Record, node: u32, paragraph: model.Paragraph, version: Version) !void {
            var out: std.ArrayList(u8) = .empty;
            defer out.deinit(allocator);
            try out.appendSlice(allocator, "keep");
            @import("paragraph_records.zig").append(allocator, &out, record, node, paragraph, version, 1000, true, 4_000_000) catch |err| {
                try std.testing.expectEqualSlices(u8, "keep", out.items);
                return err;
            };
        }
    }.run, .{ template_record, p.source_node.?, draft.right, file.header.version() });
    const previous_len = generated.items.len;
    try std.testing.expectError(error.LimitExceeded, @import("paragraph_records.zig").append(a, &generated, template_record, p.source_node.?, draft.right, file.header.version(), 1000, true, previous_len));
    try std.testing.expectEqual(previous_len, generated.items.len);
    const end: u32 = @intCast(before.len / 2 - 1);
    for ([_]u32{ 0, end }) |at| {
        var edge = try prepare(a, raw, file.header.version(), p, at, 0xfffffffe, 1000);
        defer edge.deinit(a);
        const first = try plain.textBytes(a, edge.left);
        defer a.free(first);
        const second = try plain.textBytes(a, edge.right);
        defer a.free(second);
        try std.testing.expectEqualSlices(u8, before[0 .. @as(usize, at) * 2], first[0 .. first.len - 2]);
        try std.testing.expectEqualSlices(u8, before[@as(usize, at) * 2 ..], second);
    }
    try std.testing.expectError(error.InvalidParagraphInstanceId, prepare(a, raw, file.header.version(), p, 1, p.instance_id, 1000));
    try std.testing.expectError(error.InvalidParagraphInstanceId, prepare(a, raw, file.header.version(), p, 1, 0, 1000));
    try std.testing.expectError(error.InvalidTextPosition, prepare(a, raw, file.header.version(), p, end + 1, 0xfffffffe, 1000));
    var unicode = try clone.paragraph(a, p);
    defer unicode.deinit(a);
    try plain.apply(a, raw, file.header.version(), &unicode, .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "😀" }, 1000);
    try std.testing.expectError(error.SplitSurrogatePair, prepare(a, raw, file.header.version(), unicode, 1, 0xfffffffe, 1000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, version: Version, paragraph: model.Paragraph) !void {
            var value = try prepare(allocator, bytes, version, paragraph, 1, 0xfffffffe, 1000);
            defer value.deinit(allocator);
        }
    }.run, .{ raw, file.header.version(), p });
    const unchanged = try plain.textBytes(a, p);
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, before, unchanged);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, version: Version, original: model.Section) !void {
            var section = try clone.section(allocator, original);
            defer section.deinit(allocator);
            apply(allocator, &section, bytes, version, 1, 1, 0xfffffffe, 1000) catch |err| {
                try std.testing.expectEqual(original.paragraphs.len, section.paragraphs.len);
                var original_sections = [_]model.Section{original};
                var current_sections = [_]model.Section{section};
                const first: model.Document = .{ .format = .hwp5, .sections = &original_sections };
                const second: model.Document = .{ .format = .hwp5, .sections = &current_sections };
                try std.testing.expect(@import("../../model/equality.zig").document(first, second));
                return err;
            };
            try std.testing.expectEqual(original.paragraphs.len + 1, section.paragraphs.len);
            try std.testing.expect(section.paragraphs[2].source_node == null);
            try std.testing.expectEqual(original.paragraphs[1].source_node, section.paragraphs[2].header_template);
            try std.testing.expectEqual(original.source_record_count, section.source_record_count);
            try std.testing.expectEqual(original.paragraphs[2].source_node, section.paragraphs[3].source_node);
            var tree = try @import("../body/tree.zig").Tree.parseTextPreview(allocator, bytes, version, .{});
            defer tree.deinit(allocator);
            var plan = try @import("structure_plan.zig").build(allocator, tree, section, version);
            defer plan.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 1), plan.insertions.len);
            try std.testing.expectEqual(@as(usize, 2), plan.insertions[0].paragraph);
            try std.testing.expectEqual(original.paragraphs[1].source_node.?, plan.insertions[0].template_node);
            try std.testing.expect(plan.insertions[0].owner_list == null);
        }
    }.run, .{ raw, file.header.version(), document.sections[0] });
}
