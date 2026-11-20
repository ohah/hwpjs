//! Dedicated read-only H5 owner. Never shares or replaces the editable globals.
const std = @import("std");
const a = @import("memory.zig").allocator;
const Owner = @import("../hwp5/document_text_read_owner.zig").Owner;
var owner: ?*Owner = null;
var issuer: @import("../model/formatting_binding.zig").State = .{};
var generation: @import("../model/document_text_read_generation.zig").State = .{};
var output: ?[]u8 = null;
var last_error: []const u8 = "";
fn fail(err: anyerror) u32 {
    last_error = @errorName(err);
    return 0;
}
export fn hwp5_read_error_ptr() usize {
    return if (last_error.len == 0) 0 else @intFromPtr(last_error.ptr);
}
export fn hwp5_read_error_len() usize {
    return last_error.len;
}
fn stamp() !@import("../model/document_text_read_binding.zig").Stamp {
    if (owner == null or !issuer.opened) return error.EditorNotOpen;
    return .{ .epoch = issuer.epoch, .serial = try generation.current() };
}
fn disposeOwner() void {
    if (owner) |value| value.close();
    owner = null;
}
export fn hwp5_read_open(ptr: [*]const u8, size: usize) u32 {
    if (size > 64 * 1024 * 1024) return fail(error.LimitExceeded);
    const next = issuer.next() catch |err| return fail(err);
    // Failure cannot revive a previous read ref. The external generation is
    // independent from the candidate's owned parsing/projection storage.
    generation.enterMutation() catch |err| return fail(err);
    const candidate = Owner.open(a, ptr[0..size], next) catch |err| return fail(err);
    hwp5_read_output_free();
    disposeOwner();
    issuer = next;
    owner = candidate;
    return 1;
}
export fn hwp5_read_close() void {
    generation.invalidate();
    issuer.close();
    hwp5_read_output_free();
    disposeOwner();
}
export fn hwp5_read_output_free() void {
    if (output) |value| a.free(value);
    output = null;
}
export fn hwp5_read_output_ptr() usize {
    return if (output) |value| @intFromPtr(value.ptr) else 0;
}
export fn hwp5_read_output_len() usize {
    return if (output) |value| value.len else 0;
}
export fn hwp5_read_document_text_read_binding() u32 {
    hwp5_read_output_free();
    const current = stamp() catch |err| return fail(err);
    const session = @import("../model/document_text_read_domain.zig").session(a, issuer, .readonly_hwp5) catch |err| return fail(err);
    defer a.free(session);
    var epoch_buffer: [20]u8 = undefined;
    var serial_buffer: [20]u8 = undefined;
    const epoch = std.fmt.bufPrint(&epoch_buffer, "{d}", .{current.epoch}) catch |err| return fail(err);
    const serial = std.fmt.bufPrint(&serial_buffer, "{d}", .{current.serial}) catch |err| return fail(err);
    output = @import("../json/bounded_stringify.zig").encode(a, .{
        .schemaVersion = @as(u32, 1),
        .scope = "native-document-text-read-binding",
        .executionAuthority = false,
        .format = "hwp5",
        .session = session,
        .epoch = epoch,
        .serial = serial,
    }, 2048) catch |err| return fail(err);
    return 1;
}
export fn hwp5_read_document_text_snapshot() u32 {
    hwp5_read_output_free();
    const current = stamp() catch |err| return fail(err);
    var snapshot = owner.?.snapshot(a, issuer, current) catch |err| return fail(err);
    defer snapshot.deinit();
    generation.assertCurrent(current.serial) catch |err| return fail(err);
    output = snapshot.encode(a) catch |err| return fail(err);
    return 1;
}
export fn hwp5_read_document_text_selection(ptr: [*]const u8, size: usize) u32 {
    hwp5_read_output_free();
    const current = stamp() catch |err| return fail(err);
    if (size > @import("../model/text_transaction.zig").limits.request_bytes) return fail(error.LimitExceeded);
    var request = @import("document_text_selection_request.zig").decode(a, ptr[0..size]) catch |err| return fail(err);
    defer request.deinit();
    var response = owner.?.selection(a, issuer, current, request.value) catch |err| return fail(err);
    defer response.deinit();
    generation.assertCurrent(current.serial) catch |err| return fail(err);
    output = response.encode(a) catch |err| return fail(err);
    return 1;
}
export fn hwp5_read_document_text_anchor(ptr: [*]const u8, size: usize) u32 {
    hwp5_read_output_free();
    const current = stamp() catch |err| return fail(err);
    if (size > @import("../model/text_transaction.zig").limits.request_bytes) return fail(error.LimitExceeded);
    var request = @import("document_text_anchor_request.zig").decode(a, ptr[0..size]) catch |err| return fail(err);
    defer request.deinit();
    var response = owner.?.anchor(a, issuer, current, request.value) catch |err| return fail(err);
    defer response.deinit();
    generation.assertCurrent(current.serial) catch |err| return fail(err);
    output = response.encode(a) catch |err| return fail(err);
    return 1;
}
