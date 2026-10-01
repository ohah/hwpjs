//! Optional experimental editing ABI. One native session per WASM instance.
const std = @import("std");
const a = @import("memory.zig").allocator;
const errors = @import("cfb.zig");
const Session = @import("../hwp5/edit/style_preservation.zig").Session;
var active: ?*Session = null;
var output: ?[]u8 = null;
var reflow: bool = false;

fn fail(err: anyerror) u32 {
    _ = errors.fail(err);
    return 0;
}
fn session() !*Session {
    return active orelse error.EditorNotOpen;
}
export fn hwp5_edit_output_free() void {
    if (output) |bytes| a.free(bytes);
    output = null;
    reflow = false;
}
export fn hwp5_edit_output_ptr() usize {
    return if (output) |bytes| @intFromPtr(bytes.ptr) else 0;
}
export fn hwp5_edit_output_len() usize {
    return if (output) |bytes| bytes.len else 0;
}
export fn hwp5_edit_reflow() u32 {
    return @intFromBool(reflow);
}
export fn hwp5_edit_close() void {
    hwp5_edit_output_free();
    if (active) |s| s.close();
    active = null;
}
export fn hwp5_edit_open(ptr: [*]const u8, size: usize) u32 {
    if (size > 64 * 1024 * 1024) return fail(error.LimitExceeded);
    const next = Session.open(a, ptr[0..size]) catch |err| return fail(err);
    hwp5_edit_close();
    active = next;
    return 1;
}
export fn hwp5_edit_section_count() u32 {
    const s = session() catch |err| {
        _ = fail(err);
        return std.math.maxInt(u32);
    };
    return @intCast(s.sectionCount());
}
export fn hwp5_edit_paragraph_count(section: u32) u32 {
    const s = session() catch |err| {
        _ = fail(err);
        return std.math.maxInt(u32);
    };
    return @intCast(s.paragraphCount(section) catch |err| {
        _ = fail(err);
        return std.math.maxInt(u32);
    });
}
export fn hwp5_edit_char_shape_count() u32 {
    const s = session() catch |err| {
        _ = fail(err);
        return std.math.maxInt(u32);
    };
    return @intCast(s.characterShapeCount());
}
export fn hwp5_edit_copy_text(section: u32, paragraph: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    output = s.copyText(a, section, paragraph) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_splice(section: u32, paragraph: u32, start: u32, end: u32, ptr: [*]const u8, size: usize, policy: u32) u32 {
    if (policy > 1) return fail(error.InvalidRangePolicy);
    if (size > 4 * 1024 * 1024) return fail(error.LimitExceeded);
    const s = session() catch |err| return fail(err);
    s.apply(.{ .splice_text = .{ .section = section, .paragraph = paragraph, .start_unit = start, .end_unit = end, .utf8 = ptr[0..size], .range_policy = if (policy == 1) .half_open else .reject } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_format(section: u32, paragraph: u32, start: u32, end: u32, id: u32) u32 {
    const s = session() catch |err| return fail(err);
    s.apply(.{ .set_character_format = .{ .section = section, .paragraph = paragraph, .start_unit = start, .end_unit = end, .char_shape_id = id } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_save(allow_stale_layout: u32) u32 {
    hwp5_edit_output_free();
    if (allow_stale_layout > 1) return fail(error.InvalidSavePolicy);
    const s = session() catch |err| return fail(err);
    const saved = s.save(a, .{ .allow_stale_layout = allow_stale_layout == 1 }) catch |err| return fail(err);
    output = saved.bytes;
    reflow = saved.layout_requires_reflow;
    return 1;
}
