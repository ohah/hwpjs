//! Native C boundary. Bridge pointer is C++-only; JS receives bound token pairs.
const std = @import("std");
const service = @import("context.zig");
pub const Bridge = service.Bridge;
pub const Token = service.Token;
pub const Buffer = service.Buffer;
pub const State = service.State;
pub const Status = enum(c_int) { ok = 0, no_op = 1, invalid_argument = 2, stale_handle = 3, stale_revision = 4, busy = 5, out_of_memory = 6, backend_error = 7, limit_exceeded = 8, stale_buffer = 9, indeterminate = 10 };
pub const AbiInfo = extern struct { version: u32, struct_size: u32, token_size: u32, buffer_size: u32, state_size: u32, pointer_bits: u32 };
fn status(err: anyerror) Status {
    return switch (err) {
        error.OutOfMemory => .out_of_memory,
        error.LimitExceeded, error.HistoryRevisionExhausted => .limit_exceeded,
        error.StaleHandle => .stale_handle,
        error.StaleBuffer => .stale_buffer,
        error.StaleRevision => .stale_revision,
        error.MutationUncertain, error.HistoryMutationUncertain => .indeterminate,
        else => .backend_error,
    };
}
fn fail(b: *Bridge, token: Token, err: anyerror) Status {
    if (err != error.MutationUncertain and err != error.HistoryMutationUncertain) {
        if (b.get(token)) |ctx| {
            ctx.last_error = @errorName(err);
        } else |_| {}
    }
    return status(err);
}
fn acquire(b: *Bridge) bool {
    return b.busy.cmpxchgStrong(false, true, .acquire, .monotonic) == null;
}
fn unlock(b: *Bridge) void {
    b.busy.store(false, .release);
}
fn input(ptr: ?[*]const u8, len: usize) ![]const u8 {
    if (len > service.limit) return error.LimitExceeded;
    if (len == 0) return &.{};
    return (ptr orelse return error.InvalidArgument)[0..len];
}
pub export fn hwp_native_abi_info(out: ?*AbiInfo, size: usize) Status {
    if (out == null or size != @sizeOf(AbiInfo)) return .invalid_argument;
    out.?.* = .{ .version = 1, .struct_size = @sizeOf(AbiInfo), .token_size = @sizeOf(Token), .buffer_size = @sizeOf(Buffer), .state_size = @sizeOf(State), .pointer_bits = @bitSizeOf(usize) };
    return .ok;
}
pub export fn hwp_native_bridge_create(version: u32, out: ?*?*Bridge) Status {
    if (out == null) return .invalid_argument;
    out.?.* = null;
    if (version != 1) return .invalid_argument;
    const b = std.heap.page_allocator.create(Bridge) catch return .out_of_memory;
    b.* = Bridge.init(std.heap.page_allocator);
    out.?.* = b;
    return .ok;
}
/// Caller must invalidate the JS executor and join all bridge calls before destroy.
/// Passing a destroyed Bridge pointer is invalid C usage, not a context-token close.
pub export fn hwp_native_bridge_destroy(raw: ?*Bridge) Status {
    const b = raw orelse return .invalid_argument;
    if (!acquire(b)) return .busy;
    const a = b.allocator;
    b.deinit();
    a.destroy(b);
    return .ok;
}
pub export fn hwp_native_open(raw: ?*Bridge, format: u32, ptr: ?[*]const u8, len: usize, out: ?*Token) Status {
    if (out == null) return .invalid_argument;
    out.?.* = .{};
    const b = raw orelse return .invalid_argument;
    const f = std.enums.fromInt(service.Format, format) orelse return .invalid_argument;
    const bytes = input(ptr, len) catch |err| return if (err == error.InvalidArgument) .invalid_argument else status(err);
    if (!acquire(b)) return .busy;
    defer unlock(b);
    out.?.* = b.open(f, bytes) catch |err| return status(err);
    return .ok;
}
pub export fn hwp_native_close(raw: ?*Bridge, token: Token) Status {
    const b = raw orelse return .invalid_argument;
    if (!acquire(b)) return .busy;
    defer unlock(b);
    b.close(token) catch |err| return status(err);
    return .ok;
}
pub export fn hwp_native_state(raw: ?*Bridge, token: Token, out: ?*State, size: usize) Status {
    if (out == null or size != @sizeOf(State)) return .invalid_argument;
    out.?.* = std.mem.zeroes(State);
    const b = raw orelse return .invalid_argument;
    if (!acquire(b)) return .busy;
    defer unlock(b);
    const ctx = b.get(token) catch |err| return status(err);
    out.?.* = ctx.state();
    return .ok;
}
pub export fn hwp_native_read(raw: ?*Bridge, token: Token, section: u32, paragraph: u32, out: ?*Buffer, size: usize) Status {
    if (out == null or size != @sizeOf(Buffer)) return .invalid_argument;
    out.?.* = .{};
    const b = raw orelse return .invalid_argument;
    if (!acquire(b)) return .busy;
    defer unlock(b);
    out.?.* = b.read(token, section, paragraph) catch |err| return fail(b, token, err);
    return .ok;
}
pub export fn hwp_native_save(raw: ?*Bridge, token: Token, expected: u32, allow_stale: u32, out: ?*Buffer, size: usize) Status {
    if (out == null or size != @sizeOf(Buffer)) return .invalid_argument;
    out.?.* = .{};
    if (allow_stale > 1) return .invalid_argument;
    const b = raw orelse return .invalid_argument;
    if (!acquire(b)) return .busy;
    defer unlock(b);
    out.?.* = b.save(token, expected, allow_stale == 1) catch |err| return fail(b, token, err);
    return .ok;
}
pub export fn hwp_native_splice(raw: ?*Bridge, token: Token, expected: u32, section: u32, paragraph: u32, start: u32, deleted: u32, ptr: ?[*]const u8, len: usize) Status {
    const b = raw orelse return .invalid_argument;
    const bytes = input(ptr, len) catch |err| return if (err == error.InvalidArgument) .invalid_argument else status(err);
    if (!acquire(b)) return .busy;
    defer unlock(b);
    const ctx = b.get(token) catch |err| return status(err);
    const owned = b.allocator.dupe(u8, bytes) catch return .out_of_memory;
    defer b.allocator.free(owned);
    const changed = ctx.splice(expected, section, paragraph, start, deleted, owned) catch |err| return fail(b, token, err);
    ctx.last_error = "";
    return if (changed) .ok else .no_op;
}
pub export fn hwp_native_history(raw: ?*Bridge, token: Token, expected: u32, redo: u32) Status {
    if (redo > 1) return .invalid_argument;
    const b = raw orelse return .invalid_argument;
    if (!acquire(b)) return .busy;
    defer unlock(b);
    const ctx = b.get(token) catch |err| return status(err);
    const changed = ctx.moveHistory(expected, redo == 1) catch |err| return fail(b, token, err);
    ctx.last_error = "";
    return if (changed) .ok else .no_op;
}
pub export fn hwp_native_error_copy(raw: ?*Bridge, token: Token, out: ?*Buffer, size: usize) Status {
    if (out == null or size != @sizeOf(Buffer)) return .invalid_argument;
    out.?.* = .{};
    const b = raw orelse return .invalid_argument;
    if (!acquire(b)) return .busy;
    defer unlock(b);
    out.?.* = b.copyError(token) catch |err| return status(err);
    return .ok;
}
/// No output pointer into native memory escapes. Copy is under the bridge guard.
pub export fn hwp_native_buffer_copy(raw: ?*Bridge, token: Token, dest: ?[*]u8, capacity: usize, written: ?*usize) Status {
    if (written == null) return .invalid_argument;
    written.?.* = 0;
    const b = raw orelse return .invalid_argument;
    if (!acquire(b)) return .busy;
    defer unlock(b);
    const bytes = b.output(token) catch |err| return status(err);
    if (capacity < bytes.len or (bytes.len > 0 and dest == null)) return .invalid_argument;
    if (bytes.len > 0) @memcpy(dest.?[0..bytes.len], bytes);
    written.?.* = bytes.len;
    return .ok;
}
pub export fn hwp_native_buffer_release(raw: ?*Bridge, token: Token) Status {
    const b = raw orelse return .invalid_argument;
    if (!acquire(b)) return .busy;
    defer unlock(b);
    b.release(token) catch |err| return status(err);
    return .ok;
}

/// Additive common-format owned snapshot; same Buffer lifecycle and busy guard.
pub export fn hwp_native_snapshot_v2(raw: ?*Bridge, token: Token, out: ?*Buffer, size: usize) Status {
    if (out == null or size != @sizeOf(Buffer)) return .invalid_argument;
    out.?.* = .{};
    const b = raw orelse return .invalid_argument;
    if (!acquire(b)) return .busy;
    defer unlock(b);
    out.?.* = b.snapshotV2(token, null) catch |err| return fail(b, token, err);
    return .ok;
}

pub export fn hwp_native_snapshot_window_v2(raw: ?*Bridge, token: Token, section: u32, start: u32, count: u32, expected: u32, out: ?*Buffer, size: usize) Status {
    if (out == null or size != @sizeOf(Buffer)) return .invalid_argument;
    out.?.* = .{};
    const b = raw orelse return .invalid_argument;
    if (!acquire(b)) return .busy;
    defer unlock(b);
    out.?.* = b.snapshotV2(token, .{ .section = section, .start = start, .count = count, .expected = expected }) catch |err| return fail(b, token, err);
    return .ok;
}

pub export fn hwp_native_render_sources(raw: ?*Bridge, token: Token, expected: u32, out: ?*Buffer, size: usize) Status {
    if (out == null or size != @sizeOf(Buffer)) return .invalid_argument;
    out.?.* = .{};
    const b = raw orelse return .invalid_argument;
    if (!acquire(b)) return .busy;
    defer unlock(b);
    out.?.* = b.renderSnapshot(token, expected) catch |err| return fail(b, token, err);
    return .ok;
}
pub export fn hwp_native_picture_bytes(raw: ?*Bridge, token: Token, expected: u32, section: u32, node: u32, out: ?*Buffer, size: usize) Status {
    if (out == null or size != @sizeOf(Buffer)) return .invalid_argument;
    out.?.* = .{};
    const b = raw orelse return .invalid_argument;
    if (!acquire(b)) return .busy;
    defer unlock(b);
    out.?.* = b.pictureBytes(token, expected, section, node) catch |err| return fail(b, token, err);
    return .ok;
}

/// Additive common-format owned snapshot; same Buffer lifecycle and busy guard.
pub export fn hwp_native_snapshot(raw: ?*Bridge, token: Token, out: ?*Buffer, size: usize) Status {
    if (out == null or size != @sizeOf(Buffer)) return .invalid_argument;
    out.?.* = .{};
    const b = raw orelse return .invalid_argument;
    if (!acquire(b)) return .busy;
    defer unlock(b);
    out.?.* = b.snapshot(token) catch |err| return fail(b, token, err);
    return .ok;
}

/// Read-only instance-independent negotiation. Existing ABI v1 exports stay intact.
pub const CapabilityInfo = @import("abi_contract.zig").CapabilityInfo;
pub export fn hwp_native_capabilities(out: ?*CapabilityInfo, size: usize) Status {
    const contract = @import("abi_contract.zig");
    if (out == null or size != @sizeOf(contract.CapabilityInfo)) return .invalid_argument;
    out.?.* = .{
        .version = contract.capability_version,
        .struct_size = @sizeOf(contract.CapabilityInfo),
        .abi_version = contract.abi_version,
        .snapshot_version = contract.snapshot_version,
        .render_sources_version = contract.render_sources_version,
        .flags = contract.snapshot_v2 | contract.render_sources | contract.history_v2,
    };
    return .ok;
}

// 기존 19개 함수와 구조체를 보존하는 선택적 V2 확장입니다.
pub export fn hwp_native_history_stats_v2(raw: ?*Bridge, token: Token, out: ?*Buffer, size: usize) Status {
    if (out == null or size != @sizeOf(Buffer)) return .invalid_argument;
    out.?.* = .{};
    const b = raw orelse return .invalid_argument;
    if (!acquire(b)) return .busy;
    defer unlock(b);
    out.?.* = b.historyStatsJson(token) catch |err| return fail(b, token, err);
    return .ok;
}

pub export fn hwp_native_history_configure_v2(raw: ?*Bridge, token: Token, expected: u32, ptr: ?[*]const u8, len: usize) Status {
    const b = raw orelse return .invalid_argument;
    const bytes = input(ptr, len) catch |err| return status(err);
    if (!acquire(b)) return .busy;
    defer unlock(b);
    const ctx = b.get(token) catch |err| return status(err);
    // 오래된 revision은 정책 파싱보다 먼저 거부합니다.
    if (ctx.revision != expected) return .stale_revision;
    const options = @import("../model/history_policy.zig").parse(b.allocator, bytes) catch |err| return fail(b, token, err);
    ctx.configureHistory(expected, options) catch |err| return fail(b, token, err);
    return .ok;
}
