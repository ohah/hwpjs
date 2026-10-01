//! One owned HWPX editing session per WASM instance.
const std = @import("std");
const a = @import("memory.zig").allocator;
const errors = @import("cfb.zig");
const editor = @import("../hwpx/editor_session.zig");
const histories = @import("../hwpx/editor_history.zig");
var active: ?editor.Session = null;
var history: ?histories.History = null;
var output: ?[]u8 = null;

fn fail(err: anyerror) u32 {
    _ = errors.fail(err);
    return 0;
}
export fn hwpx_edit_output_free() void {
    if (output) |bytes| a.free(bytes);
    output = null;
}
export fn hwpx_edit_output_ptr() usize {
    return if (output) |bytes| @intFromPtr(bytes.ptr) else 0;
}
export fn hwpx_edit_output_len() usize {
    return if (output) |bytes| bytes.len else 0;
}
export fn hwpx_edit_close() void {
    hwpx_edit_output_free();
    if (history) |*value| value.deinit();
    history = null;
    if (active) |*session| session.deinit();
    active = null;
}
export fn hwpx_edit_open(ptr: [*]const u8, size: usize) u32 {
    if (size > 64 * 1024 * 1024) return fail(error.LimitExceeded);
    const next = editor.open(a, ptr[0..size], .{}) catch |err| return fail(err);
    hwpx_edit_close();
    active = next;
    return 1;
}
export fn hwpx_edit_section_count() u32 {
    const session = if (active) |*value| value else {
        _ = fail(error.EditorNotOpen);
        return std.math.maxInt(u32);
    };
    return @intCast(session.sections.len);
}
export fn hwpx_edit_history_enable(entries: u32, checkpoint_bytes: u32) u32 {
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (history != null) return fail(error.HistoryAlreadyEnabled);
    if (@as(u64, entries) * checkpoint_bytes > 128 * 1024 * 1024) return fail(error.LimitExceeded);
    history = histories.History.init(session, entries, checkpoint_bytes) catch |err| return fail(err);
    return 1;
}
fn travel(redo: bool) u32 {
    const session = if (active) |*value| value else {
        _ = fail(error.EditorNotOpen);
        return 2;
    };
    const value = if (history) |*h| h else {
        _ = fail(error.HistoryNotEnabled);
        return 2;
    };
    const changed = (if (redo) value.redo(session) else value.undo(session)) catch |err| {
        _ = fail(err);
        return 2;
    };
    return @intFromBool(changed);
}
export fn hwpx_edit_undo() u32 {
    return travel(false);
}
export fn hwpx_edit_redo() u32 {
    return travel(true);
}
fn apply(command: histories.Command) !void {
    const session = if (active) |*value| value else return error.EditorNotOpen;
    if (history) |*value| {
        _ = try value.apply(session, command);
    } else switch (command.kind) {
        .plain => {
            _ = try session.splice(command.section, command.paragraph, command.start, command.deleted, command.inserted);
        },
        .anchored => {
            _ = try session.spliceAnchored(command.section, command.paragraph, command.start, command.deleted, command.inserted);
        },
        .field => {
            _ = try session.spliceFieldLabel(command.section, command.paragraph, command.begin_element, command.start, command.deleted, command.inserted);
        },
    }
}
export fn hwpx_edit_splice(section: u32, paragraph: u32, start: u32, deleted: u32, ptr: [*]const u8, size: usize) u32 {
    if (size > 4 * 1024 * 1024) return fail(error.LimitExceeded);
    apply(.{ .section = section, .paragraph = paragraph, .start = start, .deleted = deleted, .inserted = ptr[0..size] }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_splice_anchored(section: u32, paragraph: u32, start: u32, deleted: u32, ptr: [*]const u8, size: usize) u32 {
    if (size > 4 * 1024 * 1024) return fail(error.LimitExceeded);
    apply(.{ .kind = .anchored, .section = section, .paragraph = paragraph, .start = start, .deleted = deleted, .inserted = ptr[0..size] }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_anchor_text(section: u32, paragraph: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    output = session.anchorText(section, paragraph) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_splice_field_label(section: u32, paragraph: u32, begin_element: u32, start: u32, deleted: u32, ptr: [*]const u8, size: usize) u32 {
    if (size > 4 * 1024 * 1024) return fail(error.LimitExceeded);
    apply(.{ .kind = .field, .section = section, .paragraph = paragraph, .begin_element = begin_element, .start = start, .deleted = deleted, .inserted = ptr[0..size] }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_can_edit(section: u32, paragraph: u32) u32 {
    const session = if (active) |*value| value else {
        _ = fail(error.EditorNotOpen);
        return 2;
    };
    return @intFromBool(session.canEdit(section, paragraph) catch |err| {
        _ = fail(err);
        return 2;
    });
}
export fn hwpx_edit_save() u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    output = session.save() catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_field_labels(section: u32, paragraph: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const targets = session.fieldLabels(section, paragraph) catch |err| return fail(err);
    defer a.free(targets);
    const bytes = a.alloc(u8, 4 + targets.len * 12) catch |err| return fail(err);
    std.mem.writeInt(u32, bytes[0..4], @intCast(targets.len), .little);
    for (targets, 0..) |target, index| {
        const offset = 4 + index * 12;
        std.mem.writeInt(u32, bytes[offset..][0..4], target.begin_element, .little);
        std.mem.writeInt(u32, bytes[offset + 4 ..][0..4], target.start, .little);
        std.mem.writeInt(u32, bytes[offset + 8 ..][0..4], target.end, .little);
    }
    output = bytes;
    return 1;
}
