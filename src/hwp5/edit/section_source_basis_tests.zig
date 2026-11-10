//! Synthetic model/checkpoint contract only: no Session, container or real fixtures.
const std = @import("std");
const model = @import("../../model/document.zig");
const clone = @import("../../model/clone.zig");
const equality = @import("../../model/equality.zig");
const Basis = @import("../../model/section_source_basis.zig").Basis;
const cp = @import("editor_checkpoint.zig");

fn paragraph(node: ?u32) model.Paragraph {
    return .{ .source_node = node, .header_template = if (node == null) 0 else null, .instance_id = 7, .parent_node = null, .declared_units = 0, .text_present = false, .para_shape_id = 0, .style_id = 0, .tokens = &.{}, .character_runs = &.{}, .deferred_direct_records = 0 };
}

// Two PARA_HEADERs (ordinary + extended framing), one unknown record between.
fn rawSource() [60]u8 {
    var raw: [60]u8 = @splat(0);
    std.mem.writeInt(u32, raw[0..4], 66 | (22 << 20), .little);
    std.mem.writeInt(u32, raw[26..30], 511, .little);
    std.mem.writeInt(u32, raw[30..34], 66 | (0xfff << 20), .little);
    std.mem.writeInt(u32, raw[34..38], 22, .little);
    return raw;
}

fn original(a: std.mem.Allocator) !model.Document {
    var paragraphs = [_]model.Paragraph{paragraph(0)};
    const sections = try a.alloc(model.Section, 1);
    errdefer a.free(sections);
    sections[0] = try clone.section(a, .{ .paragraphs = &paragraphs, .source_record_count = 1 });
    return .{ .format = .hwp5, .sections = sections };
}

fn rebased(a: std.mem.Allocator) !model.Section {
    var raw = rawSource();
    var offsets = [_]usize{ 14, 48 };
    var paragraphs = [_]model.Paragraph{ paragraph(0), paragraph(2), paragraph(null) };
    var text = [_]u8{ 65, 0 };
    var forms = [_]@import("../../model/form_values.zig").Value{.{ .source_node = 1, .text = &text }};
    return clone.section(a, .{ .paragraphs = &paragraphs, .source_record_count = 3, .form_values = &forms, .rebased_source = .{ .bytes = &raw, .style_offsets = &offsets, .original_record_count = 1 } });
}

fn lifecycle(a: std.mem.Allocator) !void {
    var document = try original(a);
    defer document.deinit(a);
    var owner: u8 = 0;
    const before = try cp.capture(a, &owner, &document, 100000);
    defer before.deinit();
    const next = try rebased(a);
    document.sections[0].deinit(a);
    document.sections[0] = next;
    try std.testing.expectEqual(@as(usize, 1), cp.originalRecordCount(document.sections[0]));
    const after = try cp.capture(a, &owner, &document, 100000);
    defer after.deinit();
    const copied = try cp.cloneTo(after, a, &owner, 100000);
    defer copied.deinit();
    try std.testing.expect(try cp.matches(after, a, &owner, &document));
    try std.testing.expect(!try cp.matches(before, a, &owner, &document));
    document.sections[0].rebased_source.?.bytes[14] = 3;
    try std.testing.expect(!try cp.matches(after, a, &owner, &document));
    try cp.exchange(after, a, &owner, &document);
    try std.testing.expectEqual(@as(u8, 0), document.sections[0].rebased_source.?.bytes[14]);
    try std.testing.expect(try cp.matches(copied, a, &owner, &document));
    try cp.exchange(before, a, &owner, &document); // undo to original
    try std.testing.expect(document.sections[0].rebased_source == null);
    try std.testing.expectEqual(@as(usize, 1), document.sections[0].paragraphs.len);
    try cp.exchange(before, a, &owner, &document); // redo to rebased + generated paragraph
    try std.testing.expectEqual(@as(usize, 3), document.sections[0].paragraphs.len);
    try std.testing.expect(document.sections[0].paragraphs[2].source_node == null);
    try std.testing.expect(try cp.matches(copied, a, &owner, &document));
    try cp.rollback(before, a, &owner, &document);
    try std.testing.expect(document.sections[0].rebased_source == null);
}

test "HWP5 section source basis capture rebase undo redo cloneTo every allocation failure" {
    try @import("../../testing/allocation_failures.zig").check(lifecycle, .{});
}

test "HWP5 section source basis charges deep arrays exact budgets and allocation free swaps" {
    const a = std.testing.allocator;
    var document = try original(a);
    defer document.deinit(a);
    var owner: u8 = 0;
    const before = try cp.capture(a, &owner, &document, 100000);
    defer before.deinit();
    const next = try rebased(a);
    document.sections[0].deinit(a);
    document.sections[0] = next;
    const required = try cp.size(&document, 100000);
    var without = document.sections[0];
    without.rebased_source = null;
    var sections = [_]model.Section{without};
    var plain = document;
    plain.sections = &sections;
    try std.testing.expectEqual(@as(usize, 60 + 2 * @sizeOf(usize)), required - try cp.size(&plain, 100000));
    try std.testing.expectError(error.LimitExceeded, cp.size(&document, required - 1));
    try std.testing.expectError(error.LimitExceeded, cp.capture(a, &owner, &document, required - 1));
    const after = try cp.capture(a, &owner, &document, required);
    defer after.deinit();
    try std.testing.expectError(error.LimitExceeded, cp.cloneTo(after, a, &owner, required - 1));
    var failing = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    const blocked = failing.allocator();
    // Capture using the exact same allocator identity before blocking allocations.
    failing.fail_index = std.math.maxInt(usize);
    const no_alloc = try cp.capture(blocked, &owner, &document, 100000);
    defer no_alloc.deinit();
    failing.fail_index = failing.alloc_index;
    const count = failing.alloc_index;
    try cp.exchange(no_alloc, blocked, &owner, &document);
    try cp.rollback(no_alloc, blocked, &owner, &document);
    try std.testing.expectEqual(count, failing.alloc_index);
    // Undo checkpoints must reject a too-large redo payload before swapping.
    var tight_source = try original(a);
    defer tight_source.deinit(a);
    const tight = try cp.capture(a, &owner, &tight_source, required - 1);
    defer tight.deinit();
    const address = document.sections.ptr;
    try std.testing.expectError(error.LimitExceeded, cp.exchange(tight, a, &owner, &document));
    try std.testing.expectEqual(address, document.sections.ptr);
    try cp.rollback(tight, a, &owner, &document);
    try std.testing.expect(document.sections[0].rebased_source == null);
}

fn rejected(snapshot: *cp.Checkpoint, a: std.mem.Allocator, owner: *const anyopaque, document: *model.Document) !void {
    const address = document.sections.ptr;
    const basis = document.sections[0].rebased_source.?.bytes.ptr;
    try std.testing.expectError(error.SourceBindingMismatch, cp.capture(a, owner, document, 100000));
    try std.testing.expectError(error.SourceBindingMismatch, cp.matches(snapshot, a, owner, document));
    try std.testing.expectError(error.SourceBindingMismatch, cp.exchange(snapshot, a, owner, document));
    try std.testing.expectError(error.SourceBindingMismatch, cp.rollback(snapshot, a, owner, document));
    try std.testing.expectEqual(address, document.sections.ptr);
    try std.testing.expectEqual(basis, document.sections[0].rebased_source.?.bytes.ptr);
}

test "HWP5 section source basis rejects malformed framing counts offsets and binding tamper before swaps" {
    const a = std.testing.allocator;
    var document = try original(a);
    defer document.deinit(a);
    var owner: u8 = 0;
    var other: u8 = 0;
    const before = try cp.capture(a, &owner, &document, 100000);
    defer before.deinit();
    document.sections[0].source_record_count = 2;
    try std.testing.expectError(error.SourceBindingMismatch, cp.exchange(before, a, &owner, &document));
    document.sections[0].source_record_count = 1;
    const next = try rebased(a);
    document.sections[0].deinit(a);
    document.sections[0] = next;
    const basis = &document.sections[0].rebased_source.?;
    basis.original_record_count = 0;
    try rejected(before, a, &owner, &document);
    basis.original_record_count = 1;
    // Valid framing but a different canonical identity is refused by bind.
    basis.original_record_count = 2;
    try std.testing.expectError(error.SourceBindingMismatch, cp.exchange(before, a, &owner, &document));
    basis.original_record_count = 1;
    document.sections[0].source_record_count = 4;
    try rejected(before, a, &owner, &document);
    document.sections[0].source_record_count = 3;
    for ([_]usize{ 0, 13, 15, 48, std.math.maxInt(usize) }) |bad| {
        basis.style_offsets[0] = bad;
        try rejected(before, a, &owner, &document);
    }
    basis.style_offsets[0] = 14;
    const offsets = basis.style_offsets;
    basis.style_offsets = offsets[0..1];
    try rejected(before, a, &owner, &document);
    basis.style_offsets = offsets;
    const bytes = basis.bytes;
    basis.bytes = bytes[0 .. bytes.len - 1];
    try rejected(before, a, &owner, &document);
    basis.bytes = bytes;
    std.mem.writeInt(u32, bytes[0..4], 66 | (10 << 20), .little);
    try rejected(before, a, &owner, &document);
    std.mem.writeInt(u32, bytes[0..4], 66 | (22 << 20), .little);
    try std.testing.expectError(error.SourceBindingMismatch, cp.exchange(before, a, &other, &document));
    try std.testing.expectError(error.SourceBindingMismatch, cp.cloneTo(before, a, &other, 100000));
    var failing = std.testing.FailingAllocator.init(a, .{});
    try std.testing.expectError(error.SourceBindingMismatch, cp.exchange(before, failing.allocator(), &owner, &document));
    // Existing model provenance guards still apply with a verified basis.
    document.sections[0].paragraphs[0].source_node = 3;
    try std.testing.expectError(error.SourceBindingMismatch, cp.exchange(before, a, &owner, &document));
    document.sections[0].paragraphs[0].source_node = 0;
    try cp.exchange(before, a, &owner, &document);
}

test "HWP5 section source basis semantic equality is deep and includes original identity and offsets" {
    const a = std.testing.allocator;
    var left = try rebased(a);
    defer left.deinit(a);
    var right = try clone.section(a, left);
    defer right.deinit(a);
    try std.testing.expect(equality.semantic(model.Section, left, right));
    try std.testing.expect(left.rebased_source.?.bytes.ptr != right.rebased_source.?.bytes.ptr);
    try std.testing.expect(left.rebased_source.?.style_offsets.ptr != right.rebased_source.?.style_offsets.ptr);
    right.rebased_source.?.style_offsets[1] += 1;
    try std.testing.expect(!equality.semantic(model.Section, left, right));
    right.rebased_source.?.style_offsets[1] -= 1;
    right.rebased_source.?.original_record_count += 1;
    try std.testing.expect(!equality.semantic(model.Section, left, right));
    right.rebased_source.?.original_record_count -= 1;
    right.rebased_source.?.bytes[14] = 1;
    try std.testing.expect(!equality.semantic(model.Section, left, right));
}

test "HWP5 section source basis byteSize detects multiplication and addition overflow" {
    var byte: [1]u8 = .{0};
    var offset: [1]usize = .{0};
    var basis: Basis = .{ .bytes = &byte, .style_offsets = &offset, .original_record_count = 1 };
    basis.style_offsets.len = std.math.maxInt(usize);
    try std.testing.expectError(error.LimitExceeded, basis.byteSize());
    basis.style_offsets.len = 1;
    basis.bytes.len = std.math.maxInt(usize);
    try std.testing.expectError(error.LimitExceeded, basis.byteSize());
}
