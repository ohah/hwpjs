const std = @import("std");
const a = std.testing.allocator;
const model = @import("../../model/document.zig");
const plain = @import("plain_text.zig");
const Edit = @import("../../model/independent_text_edits.zig").Edit;
const version: @import("../version.zig").Version = .{ .raw = 0x05000107 };
const Fixture = struct {
    source: []u8,
    document: model.Document,
    target: usize,
    fn init(text: []const u8, generated: bool) !Fixture {
        const encoded = try std.unicode.utf8ToUtf16LeAlloc(a, text);
        defer a.free(encoded);
        return raw(std.mem.sliceAsBytes(encoded), generated, null);
    }
    fn raw(text: []const u8, generated: bool, control: ?[]const u8) !Fixture {
        const input = try @import("../../new_document/root.zig").hwp5(a);
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const original = try source.decodeSection(a, 0);
        defer a.free(original);
        var out: std.ArrayList(u8) = .empty;
        defer out.deinit(a);
        try out.appendSlice(a, original);
        var header: [22]u8 = @splat(0);
        std.mem.writeInt(u32, header[0..4], @intCast(text.len / 2 + 1), .little);
        std.mem.writeInt(u16, header[12..14], 1, .little);
        std.mem.writeInt(u32, header[18..22], 1, .little);
        var tokens = (try @import("../body/text.zig").Text.parse(text)).tokens();
        var mask: u32 = 0;
        while (try tokens.next()) |token| if (token.value == .control) {
            mask |= @as(u32, 1) << @intCast(token.value.control.code);
        };
        std.mem.writeInt(u32, header[4..8], mask, .little);
        const append = @import("../record_writer.zig").append;
        try append(a, &out, 66, 0, &header, 4_000_000);
        const terminated = try std.mem.concat(a, u8, &.{ text, &.{ 13, 0 } });
        defer a.free(terminated);
        try append(a, &out, 67, 1, terminated, 4_000_000);
        try append(a, &out, 68, 1, &(@as([8]u8, @splat(0))), 4_000_000);
        if (control) |bytes| try append(a, &out, 71, 1, bytes, 4_000_000);
        const owned = try out.toOwnedSlice(a);
        errdefer a.free(owned);
        var document = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{owned});
        errdefer document.deinit(a);
        if (generated) try @import("paragraph_split.zig").apply(a, &document.sections[0], owned, version, 1, 0, 99, 8);
        return .{ .source = owned, .document = document, .target = if (generated) 2 else 1 };
    }
    fn p(self: *Fixture) *model.Paragraph {
        return &self.document.sections[0].paragraphs[self.target];
    }
    fn deinit(self: *Fixture) void {
        self.document.deinit(a);
        a.free(self.source);
    }
};
fn sameMeaning(left: model.Paragraph, right: model.Paragraph) !void {
    const lb = try plain.textBytes(a, left);
    defer a.free(lb);
    const rb = try plain.textBytes(a, right);
    defer a.free(rb);
    try std.testing.expectEqualSlices(u8, lb, rb);
    try std.testing.expectEqualDeep(left.tokens, right.tokens);
    try std.testing.expectEqual(left.text_present, right.text_present);
    try std.testing.expectEqual(left.declared_units, right.declared_units);
    try std.testing.expectEqualDeep(left.character_runs, right.character_runs);
    try std.testing.expectEqualDeep(left.range_tags, right.range_tags);
    try std.testing.expectEqualDeep(left.field_attributes, right.field_attributes);
    try std.testing.expectEqual(left.source_node, right.source_node);
    try std.testing.expectEqual(left.header_template, right.header_template);
    try std.testing.expectEqual(left.parent_node, right.parent_node);
    try std.testing.expectEqual(left.instance_id, right.instance_id);
    try std.testing.expectEqual(left.style_id, right.style_id);
    try std.testing.expectEqual(left.para_shape_id, right.para_shape_id);
    try std.testing.expectEqual(left.deferred_direct_records, right.deferred_direct_records);
}
fn differential(f: *Fixture, edits: []const Edit, policy: @FieldType(plain.Splice, "range_policy")) !void {
    var expected = try @import("../../model/clone.zig").paragraph(a, f.p().*);
    defer expected.deinit(a);
    var index = edits.len;
    while (index > 0) {
        index -= 1;
        const edit = edits[index];
        try plain.apply(a, f.source, version, &expected, .{ .section = 0, .paragraph = f.target, .start_unit = edit.start, .end_unit = edit.end, .utf8 = edit.text, .range_policy = policy }, 8);
    }
    _ = try plain.applyIndependent(a, f.source, version, f.p(), edits, 8, .{ .range_policy = policy });
    try sameMeaning(expected, f.p().*);
}
fn styled(f: *Fixture) !void {
    const rows = try a.dupe(model.CharacterRun, &.{ .{ .start_unit = 0, .char_shape_id = 0 }, .{ .start_unit = 1, .char_shape_id = 1 }, .{ .start_unit = 2, .char_shape_id = 2 }, .{ .start_unit = 4, .char_shape_id = 3 }, .{ .start_unit = 6, .char_shape_id = 4 }, .{ .start_unit = 8, .char_shape_id = 5 }, .{ .start_unit = 9, .char_shape_id = 6 } });
    a.free(f.p().character_runs);
    f.p().character_runs = rows;
}
fn unchanged(f: *Fixture, snapshot: model.Paragraph, clone: model.Paragraph) !void {
    try std.testing.expectEqual(snapshot.tokens.ptr, f.p().tokens.ptr);
    for (snapshot.tokens, f.p().tokens) |old, current| try std.testing.expectEqual(old.raw.ptr, current.raw.ptr);
    try std.testing.expectEqual(snapshot.character_runs.ptr, f.p().character_runs.ptr);
    if (snapshot.range_tags) |rr| try std.testing.expectEqual(rr.ptr, f.p().range_tags.?.ptr);
    if (snapshot.field_attributes) |ff| try std.testing.expectEqual(ff.ptr, f.p().field_attributes.?.ptr);
    try sameMeaning(clone, f.p().*);
}

test "H5 independent bulk original generated adjacent emoji insertion deletion and reverse single styles" {
    for ([_]bool{ false, true }) |generated| {
        var f = try Fixture.init("AB😀CDEF", generated);
        defer f.deinit();
        try styled(&f);
        try differential(&f, &.{ .{ .start = 0, .end = 1, .text = "Z", .expected = "A" }, .{ .start = 1, .end = 2, .text = "" }, .{ .start = 2, .end = 4, .text = "😀" }, .{ .start = 4, .end = 4, .text = "한" }, .{ .start = 6, .end = 8, .text = "PQ" } }, .reject);
    }
}
test "H5 independent bulk per edit noops preserve buffers but equal final text may move styles" {
    var f = try Fixture.init("AB😀CDEF", false);
    defer f.deinit();
    try styled(&f);
    const old = f.p().*;
    try std.testing.expect(!try plain.applyIndependent(a, f.source, version, f.p(), &.{ .{ .start = 0, .end = 2, .text = "AB" }, .{ .start = 2, .end = 4, .text = "😀" }, .{ .start = 8, .end = 8, .text = "" } }, 8, .{}));
    try std.testing.expectEqual(old.tokens.ptr, f.p().tokens.ptr);
    try std.testing.expectEqual(old.character_runs.ptr, f.p().character_runs.ptr);
    var equal = try Fixture.init("AA", false);
    defer equal.deinit();
    a.free(equal.p().character_runs);
    equal.p().character_runs = try a.dupe(model.CharacterRun, &.{ .{ .start_unit = 0, .char_shape_id = 1 }, .{ .start_unit = 1, .char_shape_id = 2 }, .{ .start_unit = 2, .char_shape_id = 3 } });
    try differential(&equal, &.{ .{ .start = 0, .end = 1, .text = "" }, .{ .start = 2, .end = 2, .text = "A" } }, .reject);
    try std.testing.expectEqual(@as(u32, 2), equal.p().character_runs[0].char_shape_id);
}
test "H5 independent bulk late invalid expected and surrogate rejection keeps exact owned buffers" {
    var f = try Fixture.init("AB😀CDEF", false);
    defer f.deinit();
    try styled(&f);
    const snapshot = f.p().*;
    var clone = try @import("../../model/clone.zig").paragraph(a, snapshot);
    defer clone.deinit(a);
    const cases = [_]struct { edits: []const Edit, err: anyerror }{
        .{ .edits = &.{ .{ .start = 0, .end = 1, .text = "X" }, .{ .start = 6, .end = 8, .text = "Y", .expected = "XX" } }, .err = error.ExpectedTextMismatch },
        .{ .edits = &.{ .{ .start = 0, .end = 1, .text = "X" }, .{ .start = 3, .end = 4, .text = "Y" } }, .err = error.SplitSurrogatePair },
        .{ .edits = &.{ .{ .start = 0, .end = 1, .text = "X" }, .{ .start = 6, .end = 7, .text = "\n" } }, .err = error.UnsupportedTextControl },
        .{ .edits = &.{ .{ .start = 0, .end = 2, .text = "X" }, .{ .start = 1, .end = 2, .text = "Y" } }, .err = error.OverlappingTextEdits },
    };
    for (cases) |case| {
        try std.testing.expectError(case.err, plain.applyIndependent(a, f.source, version, f.p(), case.edits, 8, .{}));
        try unchanged(&f, snapshot, clone);
    }
}
test "H5 independent bulk unsorted range tags half open empty tags and default guard" {
    var f = try Fixture.init("AB😀CDEF", false);
    defer f.deinit();
    try styled(&f);
    f.p().range_tags = try a.dupe(model.TextRange, &.{ .{ .start_unit = 6, .end_unit = 8, .tag = 1 }, .{ .start_unit = 0, .end_unit = 1, .tag = 2 }, .{ .start_unit = 5, .end_unit = 5, .tag = 3 }, .{ .start_unit = 2, .end_unit = 4, .tag = 4 } });
    const original = f.p().*;
    var clone = try @import("../../model/clone.zig").paragraph(a, original);
    defer clone.deinit(a);
    try std.testing.expectError(error.UnsupportedRangeSemantics, plain.applyIndependent(a, f.source, version, f.p(), &.{.{ .start = 2, .end = 4, .text = "😀" }}, 8, .{}));
    try unchanged(&f, original, clone);
    try differential(&f, &.{ .{ .start = 1, .end = 2, .text = "XY" }, .{ .start = 4, .end = 4, .text = "Q" }, .{ .start = 6, .end = 8, .text = "" } }, .half_open);
}
test "H5 independent bulk owns replacement buffers and rejects ordinary opaque guard" {
    var f = try Fixture.init("abcdef", false);
    defer f.deinit();
    var text = [_]u8{ 'X', 'Y' };
    var expected = [_]u8{ 'b', 'c' };
    try std.testing.expect(try plain.applyIndependent(a, f.source, version, f.p(), &.{.{ .start = 1, .end = 3, .text = &text, .expected = &expected }}, 8, .{}));
    @memset(&text, 0);
    @memset(&expected, 0);
    const bytes = try plain.textBytes(a, f.p().*);
    defer a.free(bytes);
    try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(std.unicode.utf8ToUtf16LeStringLiteral("aXYdef\r")), bytes);
    const old = f.p().*;
    var clone = try @import("../../model/clone.zig").paragraph(a, old);
    defer clone.deinit(a);
    f.p().header_template = f.p().source_node;
    const invalid = f.p().*;
    try std.testing.expectError(error.SourceBindingMismatch, plain.applyIndependent(a, f.source, version, f.p(), &.{.{ .start = 0, .end = 1, .text = "Z" }}, 8, .{}));
    try std.testing.expectEqual(invalid.tokens.ptr, f.p().tokens.ptr);
    f.p().header_template = null;
    try unchanged(&f, old, clone);
}
test "H5 independent bulk bounded OOM prepares without changing original pointers" {
    var original = try Fixture.init("AB😀CDEF", false);
    defer original.deinit();
    try styled(&original);
    original.p().range_tags = try a.dupe(model.TextRange, &.{ .{ .start_unit = 6, .end_unit = 8, .tag = 31 }, .{ .start_unit = 0, .end_unit = 2, .tag = 32 } });
    const edits = [_]Edit{ .{ .start = 0, .end = 1, .text = "xyz" }, .{ .start = 4, .end = 5, .text = "한" }, .{ .start = 7, .end = 8, .text = "" } };
    var expected = try @import("../../model/clone.zig").paragraph(a, original.p().*);
    defer expected.deinit(a);
    _ = try plain.applyIndependent(a, original.source, version, &expected, &edits, 8, .{ .range_policy = .half_open });
    var failures: usize = 0;
    for (0..65) |index| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const allocator = failing.allocator();
        var paragraph = try @import("../../model/clone.zig").paragraph(allocator, original.p().*);
        defer paragraph.deinit(allocator);
        const snapshot = paragraph;
        failing.fail_index = failing.alloc_index + index;
        const result = plain.applyIndependent(allocator, original.source, version, &paragraph, &edits, 8, .{ .range_policy = .half_open });
        failing.fail_index = std.math.maxInt(usize);
        if (result) |_| {
            try sameMeaning(expected, paragraph);
        } else |err| {
            failures += 1;
            try std.testing.expectEqual(error.OutOfMemory, err);
            try std.testing.expectEqual(snapshot.tokens.ptr, paragraph.tokens.ptr);
            try std.testing.expectEqual(snapshot.character_runs.ptr, paragraph.character_runs.ptr);
            try std.testing.expectEqual(snapshot.range_tags.?.ptr, paragraph.range_tags.?.ptr);
            for (snapshot.tokens, paragraph.tokens) |before, after| try std.testing.expectEqual(before.raw.ptr, after.raw.ptr);
            try sameMeaning(original.p().*, paragraph);
        }
    }
    try std.testing.expect(failures > 0);
    std.debug.print("H5 independent range OOM {d} failures in first65 allocation offsets\n", .{failures});
}
test "H5 independent bulk work doubles input output K and metadata once" {
    var previous: usize = 0;
    for ([_]usize{ 128, 256, 512 }) |count| {
        const text = try a.alloc(u8, count * 2);
        defer a.free(text);
        @memset(text, 'a');
        var f = try Fixture.init(text, false);
        defer f.deinit();
        const edits = try a.alloc(Edit, count);
        defer a.free(edits);
        for (edits, 0..) |*edit, index| edit.* = .{ .start = @intCast(index * 2), .end = @intCast(index * 2 + 1), .text = "X", .expected = "a" };
        var work: plain.IndependentWork = .{};
        try std.testing.expect(try plain.applyIndependent(a, f.source, version, f.p(), edits, 8, .{ .work = &work }));
        try std.testing.expectEqual(@as(usize, 1), work.source_validations);
        try std.testing.expectEqual(count, work.edit_checks);
        try std.testing.expectEqual(@as(usize, 1), work.run_rows);
        const total = work.before_bytes + work.control_tokens + work.edit_checks + work.boundary_steps + work.range_rows + work.run_rows + work.field_prefix_steps + work.output_bytes;
        if (previous != 0) try std.testing.expect(total <= previous * 2);
        previous = total;
        std.debug.print("H5 independent work N={d} K={d} visits={d} source_checks=1\n", .{ count * 2, count, total });
    }
}

fn marker(code: u16, id: u32) [16]u8 {
    var bytes: [16]u8 = @splat(0);
    std.mem.writeInt(u16, bytes[0..2], code, .little);
    std.mem.writeInt(u32, bytes[2..6], id, .little);
    std.mem.writeInt(u16, bytes[14..16], code, .little);
    return bytes;
}
test "H5 independent bulk raw control payload is not Unicode text and cannot be deleted" {
    var tab = marker(9, 0xdc00d800); // deliberately non-scalar raw payload
    tab[8] = 0xff;
    tab[9] = 0xdb;
    const text = try std.mem.concat(a, u8, &.{ std.mem.sliceAsBytes(std.unicode.utf8ToUtf16LeStringLiteral("AB")), &tab, std.mem.sliceAsBytes(std.unicode.utf8ToUtf16LeStringLiteral("CD")) });
    defer a.free(text);
    var f = try Fixture.raw(text, false, null);
    defer f.deinit();
    const snapshot = f.p().*;
    var clone = try @import("../../model/clone.zig").paragraph(a, snapshot);
    defer clone.deinit(a);
    try std.testing.expectError(error.UnsupportedControlDeletion, plain.applyIndependent(a, f.source, version, f.p(), &.{ .{ .start = 0, .end = 1, .text = "X" }, .{ .start = 2, .end = 10, .text = "", .expected = "abcdefgh" } }, 8, .{}));
    try unchanged(&f, snapshot, clone);
    try differential(&f, &.{ .{ .start = 0, .end = 1, .text = "Z" }, .{ .start = 10, .end = 11, .text = "Q" } }, .reject);
    const bytes = try plain.textBytes(a, f.p().*);
    defer a.free(bytes);
    try std.testing.expectEqualSlices(u8, &tab, bytes[4..20]);
}
test "H5 independent bulk hyperlink attributes only active edits mark labels and preserve command bytes" {
    const id = @import("../body/control_rules.zig").id("%hlk");
    const open = marker(3, id);
    const close = marker(4, id & 0x00ffffff);
    const text = try std.mem.concat(a, u8, &.{ &open, std.mem.sliceAsBytes(std.unicode.utf8ToUtf16LeStringLiteral("ABCDEF")), &close });
    defer a.free(text);
    var control: [15]u8 = @splat(0);
    std.mem.writeInt(u32, control[0..4], id, .little);
    std.mem.writeInt(u32, control[11..15], 77, .little);
    var f = try Fixture.raw(text, false, &control);
    defer f.deinit();
    try std.testing.expect(!try plain.applyIndependent(a, f.source, version, f.p(), &.{ .{ .start = 8, .end = 9, .text = "A" }, .{ .start = 14, .end = 14, .text = "" } }, 8, .{}));
    try std.testing.expect(f.p().field_attributes == null);
    try differential(&f, &.{ .{ .start = 8, .end = 9, .text = "X" }, .{ .start = 10, .end = 11, .text = "C" }, .{ .start = 14, .end = 14, .text = "Q" } }, .reject);
    try std.testing.expectEqual(@as(usize, 1), f.p().field_attributes.?.len);
    try std.testing.expect(f.p().field_attributes.?[0].attributes & @import("../body/field_start.zig").modified_mask != 0);
    const bytes = try plain.textBytes(a, f.p().*);
    defer a.free(bytes);
    try std.testing.expectEqualSlices(u8, &open, bytes[0..16]);
    try std.testing.expectEqualSlices(u8, &close, bytes[30..46]);
}

test "H5 independent bulk existing section control opaque records empty and remove paths" {
    var f = try Fixture.init("unused", false);
    defer f.deinit();
    f.target = 0;
    try plain.apply(a, f.source, version, f.p(), .{ .section = 0, .paragraph = 0, .start_unit = 16, .end_unit = 16, .utf8 = "ABCDE" }, 8);
    const before = try plain.textBytes(a, f.p().*);
    defer a.free(before);
    try differential(&f, &.{ .{ .start = 16, .end = 17, .text = "X" }, .{ .start = 18, .end = 19, .text = "Y" }, .{ .start = 21, .end = 21, .text = "Z" } }, .reject);
    const after = try plain.textBytes(a, f.p().*);
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before[0..32], after[0..32]);
    try std.testing.expectEqual(@as(usize, 2), f.p().deferred_direct_records);
    for ([_]bool{ false, true }) |generated| {
        var empty = try Fixture.init("", generated);
        defer empty.deinit();
        try differential(&empty, &.{.{ .start = 0, .end = 0, .text = "😀" }}, .reject);
        try differential(&empty, &.{.{ .start = 0, .end = 2, .text = "" }}, .reject);
        const ptr = empty.p().tokens.ptr;
        try std.testing.expect(!try plain.applyIndependent(a, empty.source, version, empty.p(), &.{}, 8, .{}));
        try std.testing.expectEqual(ptr, empty.p().tokens.ptr);
    }
}
test "H5 independent bulk default disjoint range mapping preserves empty markers and order" {
    var f = try Fixture.init("AB😀CDEF", false);
    defer f.deinit();
    try styled(&f);
    f.p().range_tags = try a.dupe(model.TextRange, &.{ .{ .start_unit = 8, .end_unit = 9, .tag = 7 }, .{ .start_unit = 5, .end_unit = 5, .tag = 3 } });
    try differential(&f, &.{ .{ .start = 0, .end = 1, .text = "XYZ" }, .{ .start = 2, .end = 4, .text = "Q" } }, .reject);
    try std.testing.expectEqual(@as(u32, 9), f.p().range_tags.?[0].start_unit);
    try std.testing.expectEqual(@as(u32, 6), f.p().range_tags.?[1].start_unit);
}
test "H5 independent bulk K limit many run and unsorted range metadata linear work" {
    var previous: usize = 0;
    for ([_]usize{ 1024, 2048, 4096 }) |count| {
        const text = try a.alloc(u8, count * 2);
        defer a.free(text);
        @memset(text, 'a');
        var f = try Fixture.init(text, false);
        defer f.deinit();
        a.free(f.p().character_runs);
        f.p().character_runs = try a.alloc(model.CharacterRun, text.len + 1);
        for (f.p().character_runs, 0..) |*row, index| row.* = .{ .start_unit = @intCast(index), .char_shape_id = @intCast(index % 8) };
        f.p().range_tags = try a.alloc(model.TextRange, count);
        for (f.p().range_tags.?, 0..) |*row, index| row.* = .{ .start_unit = @intCast((count - index - 1) * 2), .end_unit = @intCast((count - index - 1) * 2 + 2), .tag = @intCast(index) };
        const edits = try a.alloc(Edit, count);
        defer a.free(edits);
        for (edits, 0..) |*edit, index| edit.* = .{ .start = @intCast(index * 2), .end = @intCast(index * 2 + 1), .text = "X" };
        var work: plain.IndependentWork = .{};
        try std.testing.expect(try plain.applyIndependent(a, f.source, version, f.p(), edits, 8, .{ .range_policy = .half_open, .work = &work }));
        try std.testing.expectEqual(text.len + 1, work.run_rows);
        try std.testing.expectEqual(count, work.range_rows);
        try std.testing.expectEqual(count, work.edit_checks);
        const total = work.before_bytes + work.control_tokens + work.edit_checks + work.boundary_steps + work.range_rows + work.run_rows + work.field_prefix_steps + work.output_bytes;
        if (previous != 0) try std.testing.expect(total <= previous * 2);
        previous = total;
        std.debug.print("H5 independent metadata N={d} K={d} runs={d} ranges={d} visits={d}\n", .{ text.len, count, work.run_rows, work.range_rows, total });
    }
}
test "H5 independent bulk field metadata late invalid and unsupported dispatch preserve input" {
    const controls = @import("../body/control_rules.zig");
    for ([_]u32{ controls.id("%hlk"), controls.id("%fmu"), controls.id("%clk"), controls.id("%usr") }) |id| {
        const begin = marker(3, id);
        const end = marker(4, id & 0x00ffffff);
        const text = try std.mem.concat(a, u8, &.{ &begin, std.mem.sliceAsBytes(std.unicode.utf8ToUtf16LeStringLiteral("AB")), &end });
        defer a.free(text);
        var header: [15]u8 = @splat(0);
        std.mem.writeInt(u32, header[0..4], id, .little);
        std.mem.writeInt(u32, header[11..15], 77, .little);
        var f = try Fixture.raw(text, false, &header);
        defer f.deinit();
        if (id == controls.id("%hlk")) f.p().field_attributes = try a.dupe(model.FieldAttributes, &.{.{ .source_node = 9999, .attributes = 0 }});
        const snapshot = f.p().*;
        var copy = try @import("../../model/clone.zig").paragraph(a, snapshot);
        defer copy.deinit(a);
        var single = try @import("../../model/clone.zig").paragraph(a, snapshot);
        defer single.deinit(a);
        const outcome = plain.apply(a, f.source, version, &single, .{ .section = 0, .paragraph = f.target, .start_unit = 8, .end_unit = 9, .utf8 = "X" }, 8);
        if (outcome) return error.TestExpectedSourceGuard else |err| {
            try std.testing.expectError(err, plain.applyIndependent(a, f.source, version, f.p(), &.{.{ .start = 8, .end = 9, .text = "X" }}, 8, .{}));
            try unchanged(&f, snapshot, copy);
        }
    }
}

fn tableFixture(generated: bool) !Fixture {
    const input = try @import("../../new_document/root.zig").hwp5(a);
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const original = try source.decodeSection(a, 0);
    defer a.free(original);
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    try output.appendSlice(a, original);
    var header: [22]u8 = @splat(0);
    std.mem.writeInt(u32, header[0..4], 9, .little);
    std.mem.writeInt(u32, header[4..8], 1 << 11, .little);
    std.mem.writeInt(u16, header[12..14], 1, .little);
    std.mem.writeInt(u32, header[18..22], 1, .little);
    const append = @import("../record_writer.zig").append;
    try append(a, &output, 66, 0, &header, 4_000_000);
    const token = marker(11, @import("../body/control_rules.zig").table_id);
    const text = try std.mem.concat(a, u8, &.{ &token, &.{ 13, 0 } });
    defer a.free(text);
    try append(a, &output, 67, 1, text, 4_000_000);
    try append(a, &output, 68, 1, &(@as([8]u8, @splat(0))), 4_000_000);
    var table = try @import("../../model/created_table.zig").create(a, 1, 2, try @import("../../model/table_creation_plan.zig").create(1, 1, 18000, 1800, 1), &.{3}, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 1);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 0, "AB😀CDEF", 100);
    const records = try @import("created_table_records.zig").write(a, &table, version, .{
        .common = .{ .flags = 0x6a2211, .offset_x = 0, .offset_y = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "synthetic" },
        .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
        .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
    }, .{ .paragraphs = .{ .char_shapes = 8, .para_shapes = 1, .styles = 1 }, .border_count = 0 }, 1, .{ .max_cells = 1, .max_bytes = 4_000_000 });
    defer a.free(records);
    try output.appendSlice(a, records);
    const raw = try output.toOwnedSlice(a);
    errdefer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{raw});
    errdefer document.deinit(a);
    if (generated) try @import("paragraph_split.zig").apply(a, &document.sections[0], raw, version, 2, 0, 99, 8);
    return .{ .source = raw, .document = document, .target = if (generated) 3 else 2 };
}
test "H5 independent bulk original and generated nested cells reuse ordinary owner policy" {
    for ([_]bool{ false, true }) |generated| {
        var f = try tableFixture(generated);
        defer f.deinit();
        try styled(&f);
        try std.testing.expect(f.p().parent_node != null);
        try differential(&f, &.{ .{ .start = 0, .end = 1, .text = "X" }, .{ .start = 2, .end = 4, .text = "한" }, .{ .start = 7, .end = 8, .text = "" } }, .reject);
    }
}
test "H5 independent bulk randomized ordered reverse valid single semantic differential" {
    var seed: u32 = 1234567;
    const points = [_]u32{ 0, 1, 2, 4, 5, 6, 7, 8 };
    const texts = [_][]const u8{ "", "X", "한", "😀" };
    for (0..128) |case| {
        var f = try Fixture.init("AB😀CDEF", case % 2 == 0);
        defer f.deinit();
        try styled(&f);
        const half = case % 4 == 1;
        if (half) f.p().range_tags = try a.dupe(model.TextRange, &.{ .{ .start_unit = 5, .end_unit = 8, .tag = 1 }, .{ .start_unit = 0, .end_unit = 2, .tag = 2 }, .{ .start_unit = 4, .end_unit = 4, .tag = 3 } });
        var edits: std.ArrayList(Edit) = .empty;
        defer edits.deinit(a);
        var point: usize = 0;
        while (point < points.len and edits.items.len < 4) {
            seed = seed *% 1664525 +% 1013904223;
            const end = @min(points.len - 1, point + seed % 3);
            try edits.append(a, .{ .start = points[point], .end = points[end], .text = texts[(seed >> 8) % texts.len] });
            point = if (end == point) point + 1 else end;
            if (end == points.len - 1) break;
        }
        try differential(&f, edits.items, if (half) .half_open else .reject);
    }
}

test "H5 independent bulk immutable source range records and explicit owned precedence" {
    var f = try Fixture.init("AB😀CDEF", false);
    defer f.deinit();
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    var it = @import("../record.zig").Iterator.init(f.source, .{});
    var paragraph: usize = 0;
    while (try it.next()) |record| {
        if (record.tag == 66) {
            if (paragraph == 1) {
                const header = try a.dupe(u8, record.payload);
                defer a.free(header);
                std.mem.writeInt(u16, header[14..16], 2, .little);
                try @import("../record_writer.zig").append(a, &raw, record.tag, record.level, header, 4_000_000);
                paragraph += 1;
                continue;
            }
            paragraph += 1;
        }
        try @import("../record_writer.zig").append(a, &raw, record.tag, record.level, record.payload, 4_000_000);
    }
    var ranges: [24]u8 = @splat(0);
    std.mem.writeInt(u32, ranges[0..4], 6, .little);
    std.mem.writeInt(u32, ranges[4..8], 8, .little);
    std.mem.writeInt(u32, ranges[8..12], 11, .little);
    std.mem.writeInt(u32, ranges[12..16], 2, .little);
    std.mem.writeInt(u32, ranges[16..20], 4, .little);
    std.mem.writeInt(u32, ranges[20..24], 22, .little);
    try @import("../record_writer.zig").append(a, &raw, 70, 1, &ranges, 4_000_000);
    const next = try raw.toOwnedSlice(a);
    const document = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{next});
    f.document.deinit(a);
    a.free(f.source);
    f.source = next;
    f.document = document;
    try std.testing.expect(f.p().range_tags == null);
    try differential(&f, &.{ .{ .start = 0, .end = 1, .text = "XYZ" }, .{ .start = 6, .end = 8, .text = "" } }, .half_open);
    try std.testing.expectEqual(@as(usize, 1), f.p().range_tags.?.len);
    try std.testing.expectEqual(@as(u32, 22), f.p().range_tags.?[0].tag);
    // An explicit empty owned list must continue to override raw source tags.
    a.free(f.p().range_tags.?);
    f.p().range_tags = try a.alloc(model.TextRange, 0);
    try differential(&f, &.{.{ .start = 4, .end = 6, .text = "😀" }}, .reject);
}
test "H5 independent bulk bounded field OOM and request limits leave all owned metadata exact" {
    const id = @import("../body/control_rules.zig").id("%hlk");
    const open = marker(3, id);
    const close = marker(4, id & 0x00ffffff);
    const text = try std.mem.concat(a, u8, &.{ &open, std.mem.sliceAsBytes(std.unicode.utf8ToUtf16LeStringLiteral("ABCDEF")), &close });
    defer a.free(text);
    var control: [15]u8 = @splat(0);
    std.mem.writeInt(u32, control[0..4], id, .little);
    std.mem.writeInt(u32, control[11..15], 77, .little);
    var f = try Fixture.raw(text, false, &control);
    defer f.deinit();
    // Materialize current field attributes through the existing single path.
    try plain.apply(a, f.source, version, f.p(), .{ .section = 0, .paragraph = 1, .start_unit = 8, .end_unit = 9, .utf8 = "X" }, 8);
    const edits = [_]Edit{ .{ .start = 8, .end = 9, .text = "Y", .expected = "X" }, .{ .start = 12, .end = 14, .text = "", .expected = "EF" } };
    var measured = std.testing.FailingAllocator.init(a, .{});
    var baseline = try @import("../../model/clone.zig").paragraph(measured.allocator(), f.p().*);
    defer baseline.deinit(measured.allocator());
    const initial = measured.alloc_index;
    try std.testing.expect(try plain.applyIndependent(measured.allocator(), f.source, version, &baseline, &edits, 8, .{}));
    const total = measured.alloc_index - initial;
    const samples = @min(@as(usize, 48), total);
    for (0..samples) |index| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const allocator = failing.allocator();
        var paragraph = try @import("../../model/clone.zig").paragraph(allocator, f.p().*);
        defer paragraph.deinit(allocator);
        const old = paragraph;
        failing.fail_index = failing.alloc_index + index * total / samples;
        const outcome = plain.applyIndependent(allocator, f.source, version, &paragraph, &edits, 8, .{});
        failing.fail_index = std.math.maxInt(usize);
        try std.testing.expectError(error.OutOfMemory, outcome);
        try std.testing.expectEqual(old.tokens.ptr, paragraph.tokens.ptr);
        try std.testing.expectEqual(old.character_runs.ptr, paragraph.character_runs.ptr);
        try std.testing.expectEqual(old.field_attributes.?.ptr, paragraph.field_attributes.?.ptr);
        for (old.tokens, paragraph.tokens) |before, after| try std.testing.expectEqual(before.raw.ptr, after.raw.ptr);
        try sameMeaning(f.p().*, paragraph);
    }
    std.debug.print("H5 independent field OOM {d} distinct samples / {d} successful allocations\n", .{ samples, total });
    const snapshot = f.p().*;
    try std.testing.expectError(error.LimitExceeded, plain.applyIndependent(a, f.source, version, f.p(), &edits, 8, .{ .limits = .{ .max_edits = 1 } }));
    try std.testing.expectEqual(snapshot.tokens.ptr, f.p().tokens.ptr);
    try std.testing.expectEqual(snapshot.field_attributes.?.ptr, f.p().field_attributes.?.ptr);
    try std.testing.expectError(error.LimitExceeded, plain.applyIndependent(a, f.source, version, f.p(), &edits, 8, .{ .limits = .{ .max_inserted_bytes = 0 } }));
    try std.testing.expectEqual(snapshot.tokens.ptr, f.p().tokens.ptr);
}

const ordinary_source = @import("plain_text_source.zig");
fn sourceDifferential(context: *ordinary_source.OrdinaryContext, source: []const u8, p: model.Paragraph) !bool {
    const expected = ordinary_source.validate(a, source, version, p, 8) catch |err| {
        try std.testing.expectError(err, context.validate(a, source, version, p, 8));
        return false;
    };
    const actual = try context.validate(a, source, version, p, 8);
    try std.testing.expectEqualDeep(expected, actual);
    return true;
}
fn scopedDifferential(f: *Fixture, context: *ordinary_source.OrdinaryContext, edits: []const Edit) !void {
    var expected = try @import("../../model/clone.zig").paragraph(a, f.p().*);
    defer expected.deinit(a);
    const changed = try plain.applyIndependent(a, f.source, version, &expected, edits, 8, .{});
    try std.testing.expectEqual(changed, try plain.applyIndependentScoped(a, context, f.source, version, f.p(), edits, 8, .{}));
    try sameMeaning(expected, f.p().*);
}
test "H5 independent scope cached original generated nested and live state differential" {
    for ([_]bool{ false, true }) |nested| for ([_]bool{ false, true }) |generated| {
        var f = if (nested) try tableFixture(generated) else try Fixture.init("AB😀CDEF", generated);
        defer f.deinit();
        const context = try ordinary_source.OrdinaryContext.create(a, f.source, version, 8);
        defer context.destroy();
        try std.testing.expect(try sourceDifferential(context, f.source, f.p().*));
        try std.testing.expect(try sourceDifferential(context, f.source, f.p().*));
        try styled(&f);
        try scopedDifferential(&f, context, &.{ .{ .start = 0, .end = 1, .text = "X", .expected = "A" }, .{ .start = 2, .end = 4, .text = "😀" }, .{ .start = 7, .end = 8, .text = "" } });
        try scopedDifferential(&f, context, &.{.{ .start = 0, .end = 1, .text = "X" }});
        const old = f.p().*;
        f.p().parent_node = if (old.parent_node == null) 0 else null;
        try std.testing.expect(!try sourceDifferential(context, f.source, f.p().*));
        f.p().* = old;
        if (generated) {
            f.p().instance_id = 0;
            try std.testing.expect(!try sourceDifferential(context, f.source, f.p().*));
            f.p().* = old;
            f.p().range_tags = try a.dupe(model.TextRange, &.{.{ .start_unit = 0, .end_unit = 1, .tag = 1 }});
            try std.testing.expect(!try sourceDifferential(context, f.source, f.p().*));
            a.free(f.p().range_tags.?);
            f.p().* = old;
            const control = marker(9, 0);
            var forged = try @import("../../model/clone.zig").paragraph(a, old);
            defer forged.deinit(a);
            for (forged.tokens) |token| a.free(token.raw);
            a.free(forged.tokens);
            forged.tokens = try @import("token_ownership.zig").fromText(a, &(control ++ [_]u8{ 13, 0 }));
            forged.declared_units = 9;
            try std.testing.expect(!try sourceDifferential(context, f.source, forged));
        }
        const work = context.measurement();
        try std.testing.expectEqual(@as(usize, 1), work.tree_builds);
        try std.testing.expectEqual(@as(usize, 1), work.template_misses);
        try std.testing.expectEqual(@as(usize, 1), work.policy_validations);
        try std.testing.expectEqual(@as(usize, 0), work.fallbacks);
        try std.testing.expectEqual(@as(usize, @intFromBool(nested)), work.owner_builds);
    };
}
test "H5 independent scope rejects stale source version resource binding and keeps late failure buffers" {
    var f = try Fixture.init("AB😀CDEF", true);
    defer f.deinit();
    const context = try ordinary_source.OrdinaryContext.create(a, f.source, version, 8);
    defer context.destroy();
    _ = try context.validate(a, f.source, version, f.p().*, 8);
    const copy = try a.dupe(u8, f.source);
    defer a.free(copy);
    try std.testing.expectError(error.SourceBindingMismatch, context.validate(a, copy, version, f.p().*, 8));
    try std.testing.expectError(error.SourceBindingMismatch, context.validate(a, f.source[0 .. f.source.len - 1], version, f.p().*, 8));
    try std.testing.expectError(error.SourceBindingMismatch, context.validate(a, f.source, .{ .raw = 0x05000108 }, f.p().*, 8));
    try std.testing.expectError(error.SourceBindingMismatch, context.validate(a, f.source, version, f.p().*, 9));
    const old = f.p().*;
    var clone = try @import("../../model/clone.zig").paragraph(a, old);
    defer clone.deinit(a);
    try std.testing.expectError(error.ExpectedTextMismatch, plain.applyIndependentScoped(a, context, f.source, version, f.p(), &.{ .{ .start = 0, .end = 1, .text = "X" }, .{ .start = 6, .end = 8, .text = "Y", .expected = "XX" } }, 8, .{}));
    try unchanged(&f, old, clone);
    f.p().header_template = 0xffffff;
    try std.testing.expect(!try sourceDifferential(context, f.source, f.p().*));
    f.p().* = old;
    f.p().field_attributes = try a.alloc(model.FieldAttributes, 0);
    try std.testing.expect(!try sourceDifferential(context, f.source, f.p().*));
    a.free(f.p().field_attributes.?);
    f.p().* = old;
}
fn appendScopeParagraph(out: *std.ArrayList(u8), text: []const u8, level: u10, instance: u32) !void {
    var header: [22]u8 = @splat(0);
    std.mem.writeInt(u32, header[0..4], @intCast(text.len / 2), .little);
    std.mem.writeInt(u16, header[12..14], 1, .little);
    std.mem.writeInt(u32, header[18..22], instance, .little);
    const append = @import("../record_writer.zig").append;
    try append(a, out, 66, level, &header, 8_000_000);
    try append(a, out, 67, level + 1, text, 8_000_000);
    try append(a, out, 68, level + 1, &(@as([8]u8, @splat(0))), 8_000_000);
}
fn scopeMany(count: usize) !Fixture {
    var base = try Fixture.init("AB", false);
    defer base.deinit();
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    try out.appendSlice(a, base.source);
    for (0..count - 1) |index| try appendScopeParagraph(&out, std.mem.sliceAsBytes(std.unicode.utf8ToUtf16LeStringLiteral("AB\r")), 0, @intCast(index + 2));
    const raw = try out.toOwnedSlice(a);
    errdefer a.free(raw);
    return .{ .source = raw, .document = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{raw}), .target = 1 };
}
test "H5 independent scope many paragraphs source preparation N 2N 4N" {
    var previous: usize = 0;
    for ([_]usize{ 32, 64, 128 }) |count| {
        var f = try scopeMany(count);
        defer f.deinit();
        const ctx = try ordinary_source.OrdinaryContext.create(a, f.source, version, 8);
        defer ctx.destroy();
        var work: plain.IndependentWork = .{};
        for (f.document.sections[0].paragraphs[1..]) |*p| {
            try std.testing.expect(try plain.applyIndependentScoped(a, ctx, f.source, version, p, &.{.{ .start = 0, .end = 1, .text = "X" }}, 8, .{ .work = &work }));
        }
        const w = ctx.measurement();
        try std.testing.expectEqual(@as(usize, 1), w.tree_builds);
        try std.testing.expectEqual(@as(usize, 1), w.policy_validations);
        try std.testing.expectEqual(count, w.template_misses);
        try std.testing.expectEqual(count * 6, w.template_text_bytes);
        try std.testing.expectEqual(count * 2, w.direct_records);
        const budget = w.source_bytes + w.template_text_bytes + w.direct_records + work.before_bytes + work.boundary_steps + work.output_bytes;
        if (previous != 0) try std.testing.expect(budget <= previous * 2 + 64);
        previous = budget;
        std.debug.print("H5 scope many P={d} source={d} tree={d} policy={d} templateBytes={d} newBudget={d}\n", .{ count, w.source_bytes, w.tree_builds, w.policy_validations, w.template_text_bytes, budget });
    }
}
test "H5 independent scope giant shared generated template scanned once N 2N 4N" {
    for ([_]usize{ 32, 64, 128 }) |count| {
        const text = try a.alloc(u8, count * 256);
        defer a.free(text);
        @memset(text, 'A');
        var f = try Fixture.init(text, true);
        defer f.deinit();
        const ctx = try ordinary_source.OrdinaryContext.create(a, f.source, version, 8);
        defer ctx.destroy();
        var work: plain.IndependentWork = .{};
        for (0..count) |i| {
            var p = try @import("../../model/clone.zig").paragraph(a, f.p().*);
            defer p.deinit(a);
            p.instance_id = @intCast(100 + i);
            for (p.tokens) |token| a.free(token.raw);
            a.free(p.tokens);
            p.tokens = try @import("token_ownership.zig").fromText(a, &.{ 65, 0, 13, 0 });
            p.declared_units = 2;
            try std.testing.expect(try plain.applyIndependentScoped(a, ctx, f.source, version, &p, &.{.{ .start = 0, .end = 1, .text = "X" }}, 8, .{ .work = &work }));
        }
        const w = ctx.measurement();
        try std.testing.expectEqual(@as(usize, 1), w.template_misses);
        try std.testing.expectEqual(count - 1, w.template_hits);
        try std.testing.expectEqual(text.len * 2 + 2, w.template_text_bytes);
        try std.testing.expectEqual(count * 4, work.before_bytes);
        try std.testing.expectEqual(@as(usize, 1), w.policy_validations);
        std.debug.print("H5 scope shared P={d} templateBytes={d} misses={d} hits={d} currentBytes={d}\n", .{ count, w.template_text_bytes, w.template_misses, w.template_hits, work.before_bytes });
    }
}
test "H5 independent scope owned tree hyperlink source and live field metadata" {
    const id = @import("../body/control_rules.zig").id("%hlk");
    const open = marker(3, id);
    const close = marker(4, id & 0x00ffffff);
    const text = try std.mem.concat(a, u8, &.{ &open, std.mem.sliceAsBytes(std.unicode.utf8ToUtf16LeStringLiteral("ABCDEF")), &close });
    defer a.free(text);
    var control: [15]u8 = @splat(0);
    std.mem.writeInt(u32, control[0..4], id, .little);
    std.mem.writeInt(u32, control[11..15], 77, .little);
    var f = try Fixture.raw(text, false, &control);
    defer f.deinit();
    const ctx = try ordinary_source.OrdinaryContext.create(a, f.source, version, 8);
    defer ctx.destroy();
    try scopedDifferential(&f, ctx, &.{.{ .start = 8, .end = 9, .text = "X" }});
    try scopedDifferential(&f, ctx, &.{.{ .start = 9, .end = 10, .text = "Y" }});
    const old = f.p().*;
    f.p().field_attributes.?[0].source_node += 1;
    try std.testing.expectError(error.SourceBindingMismatch, plain.applyIndependentScoped(a, ctx, f.source, version, f.p(), &.{.{ .start = 8, .end = 9, .text = "Z" }}, 8, .{}));
    try std.testing.expectEqual(old.tokens.ptr, f.p().tokens.ptr);
    const w = ctx.measurement();
    try std.testing.expectEqual(@as(usize, 1), w.control_validations);
    try std.testing.expectEqual(@as(usize, 1), w.tree_builds);
}
test "H5 independent scope restart original generated fallback keeps dynamic source contract" {
    const id = @import("../body/control_rules.zig").id("nwno");
    const restart = marker(21, id);
    const raw = try std.mem.concat(a, u8, &.{ &restart, std.mem.sliceAsBytes(std.unicode.utf8ToUtf16LeStringLiteral("AB")) });
    defer a.free(raw);
    var control: [10]u8 = @splat(0);
    std.mem.writeInt(u32, control[0..4], id, .little);
    std.mem.writeInt(u16, control[8..10], 2, .little);
    var f = try Fixture.raw(raw, false, &control);
    defer f.deinit();
    const ctx = try ordinary_source.OrdinaryContext.create(a, f.source, version, 8);
    defer ctx.destroy();
    try std.testing.expect(try sourceDifferential(ctx, f.source, f.p().*));
    try scopedDifferential(&f, ctx, &.{.{ .start = 8, .end = 9, .text = "X" }});
    var generated = try @import("../../model/clone.zig").paragraph(a, f.p().*);
    defer generated.deinit(a);
    generated.header_template = generated.source_node;
    generated.source_node = null;
    generated.instance_id = 99;
    try std.testing.expect(try sourceDifferential(ctx, f.source, generated));
    generated.restart_control_source = 0xffffff;
    try std.testing.expect(!try sourceDifferential(ctx, f.source, generated));
    try std.testing.expectEqual(@as(usize, 0), ctx.measurement().template_misses);
    try std.testing.expect(ctx.measurement().fallbacks >= 4);
}
test "H5 independent scope memo owned nested and body fallback exact validator" {
    var f = try Fixture.init("AB", false);
    defer f.deinit();
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    try out.appendSlice(a, f.source);
    const append = @import("../record_writer.zig").append;
    try append(a, &out, 93, 1, &.{ 1, 0, 0, 0 }, 8_000_000);
    var list: [16]u8 = @splat(0);
    list[0] = 1;
    try append(a, &out, 72, 1, &list, 8_000_000);
    try appendScopeParagraph(&out, std.mem.sliceAsBytes(std.unicode.utf8ToUtf16LeStringLiteral("memo\r")), 1, 3);
    const raw = try out.toOwnedSlice(a);
    defer a.free(raw);
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{raw});
    defer doc.deinit(a);
    const ctx = try ordinary_source.OrdinaryContext.create(a, raw, version, 8);
    defer ctx.destroy();
    var accepted: usize = 0;
    for (doc.sections[0].paragraphs) |p| accepted += @intFromBool(try sourceDifferential(ctx, raw, p));
    try std.testing.expect(accepted >= 1);
    try std.testing.expectEqual(doc.sections[0].paragraphs.len, ctx.measurement().fallbacks);
    try std.testing.expectEqual(@as(usize, 0), ctx.measurement().template_misses);
}
test "H5 independent scope selected invalid owner versus section policy error order" {
    var f = try Fixture.init("AB", false);
    defer f.deinit();
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    try out.appendSlice(a, f.source);
    // A sibling paragraph directly owned by a root without a LIST_HEADER. A
    // later unknown root supplies another error; memo.target must still win.
    try appendScopeParagraph(&out, &.{ 65, 0, 13, 0 }, 1, 4);
    try @import("../record_writer.zig").append(a, &out, 1000, 0, &.{}, 8_000_000);
    const raw = try out.toOwnedSlice(a);
    defer a.free(raw);
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, raw, version, .{});
    defer tree.deinit(a);
    var p = f.p().*;
    for (tree.nodes, 0..) |node, i| if (node.record.value == .header and node.parent != null) {
        p.source_node = @intCast(i);
        p.parent_node = @intCast(node.parent.?);
        break;
    };
    const ctx = try ordinary_source.OrdinaryContext.create(a, raw, version, 8);
    defer ctx.destroy();
    try std.testing.expectError(error.OrphanListParagraph, ordinary_source.validate(a, raw, version, p, 8));
    try std.testing.expect(!try sourceDifferential(ctx, raw, p));
}
test "H5 independent scope OOM constructor cache preparation and bulk preserve exact buffers" {
    var f = try tableFixture(true);
    defer f.deinit();
    const edits = [_]Edit{ .{ .start = 0, .end = 1, .text = "X" }, .{ .start = 6, .end = 8, .text = "Y" } };
    var measured = std.testing.FailingAllocator.init(a, .{});
    const allocator = measured.allocator();
    var success = try @import("../../model/clone.zig").paragraph(allocator, f.p().*);
    defer success.deinit(allocator);
    const first = measured.alloc_index;
    const ctx = try ordinary_source.OrdinaryContext.create(allocator, f.source, version, 8);
    defer ctx.destroy();
    _ = try plain.applyIndependentScoped(allocator, ctx, f.source, version, &success, &edits, 8, .{});
    const total = measured.alloc_index - first;
    const samples = @min(total, 64);
    for (0..samples) |i| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const fa = failing.allocator();
        var p = try @import("../../model/clone.zig").paragraph(fa, f.p().*);
        defer p.deinit(fa);
        const old = p;
        failing.fail_index = failing.alloc_index + i * total / samples;
        const attempt = ordinary_source.OrdinaryContext.create(fa, f.source, version, 8);
        if (attempt) |scope| {
            defer scope.destroy();
            const result = plain.applyIndependentScoped(fa, scope, f.source, version, &p, &edits, 8, .{});
            failing.fail_index = std.math.maxInt(usize);
            try std.testing.expectError(error.OutOfMemory, result);
            try std.testing.expectEqual(old.tokens.ptr, p.tokens.ptr);
            try std.testing.expectEqual(old.character_runs.ptr, p.character_runs.ptr);
            try sameMeaning(f.p().*, p);
            // A failed cache publication never authorizes stale/current state;
            // retry with restored allocator rechecks all necessary facts.
            _ = try plain.applyIndependentScoped(fa, scope, f.source, version, &p, &edits, 8, .{});
        } else |err| {
            failing.fail_index = std.math.maxInt(usize);
            try std.testing.expectEqual(error.OutOfMemory, err);
            try std.testing.expectEqual(old.tokens.ptr, p.tokens.ptr);
            try sameMeaning(f.p().*, p);
        }
    }
    std.debug.print("H5 scope OOM {d} samples / {d} preparation allocations\n", .{ samples, total });
}

fn scopeManyNested(count: usize) !Fixture {
    var base = try tableFixture(false);
    defer base.deinit();
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, base.source, version, .{});
    defer tree.deinit(a);
    var groups = try @import("paragraph_owner.zig").inspectGroups(a, tree, version);
    defer groups.deinit(a);
    const paragraph = try base.p().originalNode();
    const list = (try @import("paragraph_owner.zig").logicalOwner(tree, groups, paragraph)).?;
    const node = tree.nodes[paragraph];
    const stop_node = node.subtree_end;
    const stop = if (stop_node < tree.nodes.len) tree.nodes[stop_node].record.framing.offset else base.source.len;
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    try out.appendSlice(a, base.source[0..stop]);
    for (0..count - 1) |i| try appendScopeParagraph(&out, std.mem.sliceAsBytes(std.unicode.utf8ToUtf16LeStringLiteral("AB\r")), node.record.framing.level, @intCast(i + 10));
    try out.appendSlice(a, base.source[stop..]);
    const payload_offset = @intFromPtr(tree.nodes[list].record.framing.payload.ptr) - @intFromPtr(base.source.ptr);
    std.mem.writeInt(u16, out.items[payload_offset..][0..2], @intCast(count), .little);
    const raw = try out.toOwnedSlice(a);
    errdefer a.free(raw);
    return .{ .source = raw, .document = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{raw}), .target = 2 };
}
test "H5 independent scope many nested paragraphs reuse group and table SSOT inventories" {
    var previous: usize = 0;
    for ([_]usize{ 32, 64, 128 }) |count| {
        var f = try scopeManyNested(count);
        defer f.deinit();
        const ctx = try ordinary_source.OrdinaryContext.create(a, f.source, version, 8);
        defer ctx.destroy();
        for (f.document.sections[0].paragraphs[2..]) |*p| {
            try std.testing.expect(try plain.applyIndependentScoped(a, ctx, f.source, version, p, &.{.{ .start = 0, .end = 1, .text = "X" }}, 8, .{}));
        }
        const w = ctx.measurement();
        try std.testing.expectEqual(count, w.template_misses);
        try std.testing.expectEqual(@as(usize, 1), w.owner_builds);
        try std.testing.expectEqual(@as(usize, 1), w.selected_lists);
        try std.testing.expectEqual(@as(usize, 1), w.table_inventories);
        if (previous != 0) try std.testing.expect(w.owner_index_steps <= previous * 2);
        previous = w.owner_index_steps;
        std.debug.print("H5 scope nested P={d} ownerBuilds={d} indexSteps={d} selectedLists={d} tableInventories={d}\n", .{ count, w.owner_builds, w.owner_index_steps, w.selected_lists, w.table_inventories });
    }
}
