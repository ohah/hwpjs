//! Current-model hyperlink spans. Positions are derived, not an editable cache.
//! Cross-paragraph spans currently require root siblings; nested list ownership
//! must not be guessed from a shared control parent.
const std = @import("std");
const model = @import("../../model/document.zig");
const controls = @import("../body/control_rules.zig");
const Text = @import("../body/text.zig").Text;

pub const Position = struct { paragraph: usize, unit: u32 };
pub const Span = struct { begin: Position, end: Position, ordinal: usize };

pub fn collect(a: std.mem.Allocator, section: model.Section) ![]Span {
    const Open = struct { begin: Position, ordinal: usize };
    var stack: [32]Open = undefined;
    var depth: usize = 0;
    var out: std.ArrayList(Span) = .empty;
    errdefer out.deinit(a);
    const id = controls.id("%hlk");
    for (section.paragraphs, 0..) |p, pi| {
        if (depth != 0 and (p.parent_node != null or section.paragraphs[stack[0].begin.paragraph].parent_node != null)) return error.UnsupportedCrossParagraphField;
        var ordinal: usize = 0;
        for (p.tokens) |token| {
            if (token.kind != .control) continue;
            var tokens = (try Text.parse(token.raw)).tokens();
            const parsed = (try tokens.next()) orelse return error.SourceBindingMismatch;
            if (parsed.value != .control or try tokens.next() != null) return error.SourceBindingMismatch;
            const c = parsed.value.control;
            if (c.code == 3) {
                if (std.mem.readInt(u32, c.data[0..4], .little) != id) return error.UnsupportedSectionControl;
                if (depth == stack.len) return error.LimitExceeded;
                stack[depth] = .{ .begin = .{ .paragraph = pi, .unit = token.start_unit + @as(u32, @intCast(token.raw.len / 2)) }, .ordinal = ordinal };
                ordinal += 1;
                depth += 1;
            } else if (c.code == 4) {
                if (depth == 0) return error.UnsupportedCrossParagraphField;
                const end_id = std.mem.readInt(u32, c.data[0..4], .little);
                if (end_id != id and end_id != (id & 0x00ffffff)) return error.FieldMarkerMismatch;
                depth -= 1;
                try out.append(a, .{ .begin = stack[depth].begin, .end = .{ .paragraph = pi, .unit = token.start_unit }, .ordinal = stack[depth].ordinal });
            }
        }
    }
    if (depth != 0) return error.UnsupportedCrossParagraphField;
    return out.toOwnedSlice(a);
}

test "root hyperlink spans join paragraphs without inferring nested list ownership" {
    var start = [_]u8{ 3, 0, 'k', 'l', 'h', '%', 0, 0, 0, 0, 0, 0, 0, 0, 3, 0 };
    var end = [_]u8{ 4, 0, 'k', 'l', 'h', 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0 };
    var first_tokens = [_]model.Token{.{ .start_unit = 7, .kind = .control, .encoding = .utf16le, .raw = &start }};
    var last_tokens = [_]model.Token{.{ .start_unit = 4, .kind = .control, .encoding = .utf16le, .raw = &end }};
    var ps = [_]model.Paragraph{ paragraph(&first_tokens), paragraph(&last_tokens) };
    const section = model.Section{ .paragraphs = &ps, .source_record_count = 0 };
    const spans = try collect(std.testing.allocator, section);
    defer std.testing.allocator.free(spans);
    try std.testing.expectEqual(@as(usize, 1), spans.len);
    try std.testing.expectEqual(Position{ .paragraph = 0, .unit = 15 }, spans[0].begin);
    try std.testing.expectEqual(Position{ .paragraph = 1, .unit = 4 }, spans[0].end);
    end[2] = 'x';
    try std.testing.expectError(error.FieldMarkerMismatch, collect(std.testing.allocator, section));
    end[2] = 'k';
    ps[1].parent_node = 42;
    try std.testing.expectError(error.UnsupportedCrossParagraphField, collect(std.testing.allocator, section));
    ps[1].parent_node = null;
    ps[1].tokens = &.{};
    try std.testing.expectError(error.UnsupportedCrossParagraphField, collect(std.testing.allocator, section));
}

fn paragraph(tokens: []model.Token) model.Paragraph {
    return .{ .source_node = 0, .parent_node = null, .declared_units = 0, .text_present = true, .para_shape_id = 0, .style_id = 0, .tokens = tokens, .character_runs = &.{}, .deferred_direct_records = 0 };
}

test "actual crossing-lineseg fixture exposes local and cross-paragraph hyperlink spans" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwp", a, .limited(2_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const section = try source.decodeSection(a, 0);
    defer a.free(section);
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{section});
    defer doc.deinit(a);
    const spans = try collect(a, doc.sections[0]);
    defer a.free(spans);
    try std.testing.expectEqual(@as(usize, 2), spans.len);
    try std.testing.expectEqual(Position{ .paragraph = 0, .unit = 24 }, spans[0].begin);
    try std.testing.expectEqual(Position{ .paragraph = 0, .unit = 65 }, spans[0].end);
    try std.testing.expectEqual(Position{ .paragraph = 1, .unit = 15 }, spans[1].begin);
    try std.testing.expectEqual(Position{ .paragraph = 2, .unit = 4 }, spans[1].end);
}
