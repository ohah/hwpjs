const std = @import("std");
const values = @import("created_table_values.zig");
const Value = @import("created_table_value.zig").Value;
const model = @import("../../model/created_table.zig");

fn refused(expected: anyerror, result: anyerror!void) !void {
    if (result) return error.TestUnexpectedResult else |err| {
        if (err == error.OutOfMemory) return err;
        try std.testing.expectEqual(expected, err);
    }
}

fn source(a: std.mem.Allocator) !Value {
    var table = try model.create(a, 1, 2, try @import("../../model/table_creation_plan.zig").create(1, 1, 100, 20, 1), &.{3}, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 1);
    defer table.deinit(a);
    return Value.initClone(a, &table, .{
        .common = .{ .flags = 0x6a2211, .offset_x = 0, .offset_y = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "표😀" },
        .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
        .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
    }, 4096);
}

fn exercise(a: std.mem.Allocator) !void {
    var input = try source(a);
    defer input.deinit(a);
    var state: values.Values = .{};
    defer state.deinit(a);
    const anchor: values.Anchor = .{ .host = .{ .original_node = 0 }, .unit = 2 };
    const exact = try Value.ownedSize(&input.table, input.options) + @sizeOf(values.Entry) - @sizeOf(Value);
    try std.testing.expectError(error.InvalidTableOwner, state.append(a, .{ .host = .{ .generated_instance = 0 }, .unit = 0 }, &input, 2, 4096));
    try std.testing.expectError(error.LimitExceeded, state.append(a, anchor, &input, 0, 4096));
    try std.testing.expectError(error.LimitExceeded, state.append(a, anchor, &input, 2, exact - 1));
    try state.append(a, anchor, &input, 2, exact);
    try std.testing.expectEqual(exact, try state.byteSize(exact));
    var copy = try state.clone(a, exact);
    defer copy.deinit(a);
    try std.testing.expectEqualDeep(state, copy);
    _ = try copy.entries[0].value.table.replaceText(a, 0, 0, "별도", 100);
    try std.testing.expectEqualStrings("", state.entries[0].value.table.cells[0].text);
    try std.testing.expectError(error.InvalidCreatedTableIdentity, state.append(a, anchor, &input, 2, 4096));
    input.table.identity = 4;
    input.table.instance_id = 5;
    try refused(error.InvalidTableParagraphIds, state.append(a, anchor, &input, 2, 4096));
    input.table.cells[0].paragraph_id = 6;
    const first_pointer = state.entries.ptr;
    state.append(a, .{ .host = .{ .generated_instance = 7 }, .unit = 0 }, &input, 2, 4096) catch |err| {
        try std.testing.expectEqual(@as(usize, 1), state.entries.len);
        try std.testing.expect(state.entries.ptr == first_pointer);
        try std.testing.expectEqualStrings("표😀", state.entries[0].value.options.common.description);
        return err;
    };
    try std.testing.expectEqual(@as(usize, 2), state.entries.len);
    try std.testing.expectEqual(@as(u32, 6), state.entries[1].value.table.cells[0].paragraph_id);
    try std.testing.expectEqual(@as(u32, 7), state.entries[1].anchor.host.generated_instance);
}

test "HWP5 generated table values atomically own multiple tables and scoped anchors" {
    try exercise(std.testing.allocator);
    try @import("../../testing/allocation_failures.zig").check(exercise, .{});
}

test "HWP5 generated table values rebase only matching hosts and reject late failures atomically" {
    const a = std.testing.allocator;
    var input = try source(a);
    defer input.deinit(a);
    var state: values.Values = .{};
    defer state.deinit(a);
    const host: values.Host = .{ .original_node = 0 };
    for ([_]u32{ 2, 5, 9 }, 0..) |unit, index| {
        input.table.identity = index + 1;
        input.table.instance_id = @intCast(index + 10);
        input.table.cells[0].paragraph_id = @intCast(index + 20);
        try state.append(a, .{ .host = if (index == 2) .{ .generated_instance = 7 } else host, .unit = unit }, &input, 3, 4096);
    }
    try state.rebase(host, 0, 0, 2);
    try std.testing.expectEqual(@as(u32, 4), state.entries[0].anchor.unit);
    try std.testing.expectEqual(@as(u32, 7), state.entries[1].anchor.unit);
    try std.testing.expectEqual(@as(u32, 9), state.entries[2].anchor.unit);
    try std.testing.expectError(error.ProtectedCreatedTableAnchor, state.rebase(host, 4, 4, 2));
    try std.testing.expectEqual(@as(u32, 4), state.entries[0].anchor.unit);
    try std.testing.expectEqual(@as(u32, 7), state.entries[1].anchor.unit);
    state.entries[1].anchor.unit = std.math.maxInt(u32);
    try std.testing.expectError(error.LimitExceeded, state.rebase(host, 0, 0, 1));
    try std.testing.expectEqual(@as(u32, 4), state.entries[0].anchor.unit);
    try std.testing.expectEqual(std.math.maxInt(u32), state.entries[1].anchor.unit);
}

test "HWP5 generated table structural anchors split merge and protect host deletion" {
    const a = std.testing.allocator;
    const structure = @import("created_table_anchor_structure.zig");
    var input = try source(a);
    defer input.deinit(a);
    var state: values.Values = .{};
    defer state.deinit(a);
    const host: values.Host = .{ .original_node = 0 };
    for ([_]u32{ 1, 3, 6 }, 0..) |unit, index| {
        input.table.identity = index + 1;
        input.table.instance_id = @intCast(index + 10);
        input.table.cells[0].paragraph_id = @intCast(index + 20);
        try state.append(a, .{ .host = host, .unit = unit }, &input, 3, 4096);
    }
    var baseline = try state.clone(a, 4096);
    defer baseline.deinit(a);
    try std.testing.expectError(error.InvalidParagraphInstanceId, structure.split(state.entries, host, 0, 3));
    try std.testing.expectError(error.InvalidParagraphInstanceId, structure.split(state.entries, host, 21, 3));
    try std.testing.expectEqualDeep(baseline, state);
    try structure.split(state.entries, host, 7, 3);
    try std.testing.expect(std.meta.eql(host, state.entries[0].anchor.host));
    try std.testing.expectEqual(@as(u32, 1), state.entries[0].anchor.unit);
    try std.testing.expectEqual(@as(u32, 0), state.entries[1].anchor.unit);
    try std.testing.expectEqual(@as(u32, 3), state.entries[2].anchor.unit);
    const suffix: values.Host = .{ .generated_instance = 7 };
    try std.testing.expect(std.meta.eql(suffix, state.entries[1].anchor.host));
    try std.testing.expectError(error.ProtectedCreatedTableAnchor, structure.requireUnanchored(state.entries, suffix));
    try std.testing.expectError(error.InvalidParagraphInstanceId, structure.split(state.entries, host, 7, 0));
    var split_state = try state.clone(a, 4096);
    defer split_state.deinit(a);
    try std.testing.expectError(error.LimitExceeded, structure.merge(state.entries, host, suffix, std.math.maxInt(u32)));
    try std.testing.expectEqualDeep(split_state, state);
    try std.testing.expectError(error.SourceBindingMismatch, structure.merge(state.entries, suffix, suffix, 0));
    try structure.merge(state.entries, host, suffix, 3);
    try std.testing.expectEqualDeep(baseline, state);
    try structure.requireUnanchored(state.entries, suffix);
    try std.testing.expectError(error.ProtectedCreatedTableAnchor, structure.requireUnanchored(state.entries, host));
}

test "HWP5 generated table structural anchor resolves against actual split and merged model" {
    const a = std.testing.allocator;
    const anchors = @import("created_table_anchor.zig");
    const structure = @import("created_table_anchor_structure.zig");
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var file = try @import("../text_source.zig").Source.open(a, input);
    defer file.deinit();
    const raw = try file.decodeSection(a, 0);
    defer a.free(raw);
    const info = try file.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    const counts = try @import("../docinfo/resources.zig").inspect(info, file.header.version(), .{});
    var document = try @import("../model_projection.zig").fromDecodedSections(a, file.header.version(), &.{raw});
    defer document.deinit(a);
    var input_value = try source(a);
    defer input_value.deinit(a);
    var state: values.Values = .{};
    defer state.deinit(a);
    const original = try anchors.capture(a, &document.sections[0], 1, 1);
    try state.append(a, original, &input_value, 1, 4096);
    try @import("structure_session.zig").split(a, &.{raw}, &document, file.header.version(), .{ .section = 0, .paragraph = 1, .at_unit = 1 }, counts.count(.char_shape), 4_000_000);
    const suffix = try anchors.capture(a, &document.sections[0], 2, 0);
    try structure.split(state.entries, original.host, suffix.host.generated_instance, 1);
    try std.testing.expectEqual(@as(usize, 2), try anchors.resolve(a, &document.sections[0], state.entries[0].anchor));
    try @import("merge_session.zig").apply(a, &.{raw}, &document, file.header.version(), .{ .section = 0, .paragraph = 1 }, counts.count(.char_shape), 4_000_000);
    try structure.merge(state.entries, original.host, suffix.host, 1);
    try std.testing.expectEqualDeep(original, state.entries[0].anchor);
    try std.testing.expectEqual(@as(usize, 1), try anchors.resolve(a, &document.sections[0], state.entries[0].anchor));
}

fn checkpointExercise(a: std.mem.Allocator) !void {
    const checkpoint = @import("table_checkpoint.zig");
    const document_model = @import("../../model/document.zig");
    var paragraphs = [_]document_model.Paragraph{.{ .source_node = 0, .parent_node = null, .declared_units = 1, .text_present = false, .para_shape_id = 0, .style_id = 0, .tokens = &.{}, .character_runs = &.{}, .deferred_direct_records = 0 }};
    const sections = try a.alloc(document_model.Section, 1);
    sections[0] = @import("../../model/clone.zig").section(a, .{ .paragraphs = &paragraphs, .source_record_count = 1 }) catch |err| {
        a.free(sections);
        return err;
    };
    var document: document_model.Document = .{ .format = .hwp5, .sections = sections };
    defer document.deinit(a);
    var tables = try a.alloc(values.Values, 1);
    tables[0] = .{};
    defer {
        for (tables) |*table| table.deinit(a);
        a.free(tables);
    }
    var owner: u8 = 0;
    var other_owner: u8 = 0;
    const exact = try checkpoint.size(&document, tables, 4096);
    try std.testing.expectError(error.LimitExceeded, checkpoint.capture(a, &owner, &document, tables, exact - 1));
    const before = try checkpoint.capture(a, &owner, &document, tables, 4096);
    defer before.deinit();
    var input = try source(a);
    defer input.deinit(a);
    try tables[0].append(a, .{ .host = .{ .original_node = 0 }, .unit = 0 }, &input, 1, 4096);
    try std.testing.expect(!try checkpoint.matches(before, a, &owner, &document, tables));
    try std.testing.expectError(error.SourceBindingMismatch, checkpoint.exchange(before, a, &other_owner, &document, &tables));
    try checkpoint.exchange(before, a, &owner, &document, &tables);
    try std.testing.expectEqual(@as(usize, 0), tables[0].entries.len);
    try checkpoint.exchange(before, a, &owner, &document, &tables);
    try std.testing.expectEqual(@as(usize, 1), tables[0].entries.len);
    const after = try checkpoint.capture(a, &owner, &document, tables, 4096);
    defer after.deinit();
    try std.testing.expect(try checkpoint.matches(after, a, &owner, &document, tables));
    tables[0].entries[0].value.options.common.offset_x = 19;
    try std.testing.expect(!try checkpoint.matches(after, a, &owner, &document, tables));
    try checkpoint.rollback(after, a, &owner, &document, &tables);
    try std.testing.expectEqual(@as(i32, 0), tables[0].entries[0].value.options.common.offset_x);
    const growth = try checkpoint.capture(a, &owner, &document, tables, 4096);
    defer growth.deinit();
    const text = try a.alloc(u8, 5000);
    defer a.free(text);
    @memset(text, 'a');
    _ = try tables[0].entries[0].value.table.replaceText(a, 0, 0, text, 10000);
    try std.testing.expectError(error.LimitExceeded, checkpoint.exchange(growth, a, &owner, &document, &tables));
    try checkpoint.rollback(growth, a, &owner, &document, &tables);
    try std.testing.expectEqualStrings("", tables[0].entries[0].value.table.cells[0].text);
}

test "HWP5 table checkpoint exchanges owned semantics and rolls back rejected growth under failures" {
    try checkpointExercise(std.testing.allocator);
    try @import("../../testing/allocation_failures.zig").check(checkpointExercise, .{});
}
