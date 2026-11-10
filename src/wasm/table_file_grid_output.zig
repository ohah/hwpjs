//! Immutable source-table whole-file ABI ownership. No session state.
const std = @import("std");
const builtin = @import("builtin");
const plan = @import("../model/table_grid_edit_plan.zig");
pub const max_input_bytes: usize = 64 * 1024 * 1024;
pub const max_output_bytes: usize = 128 * 1024 * 1024;
pub const Request = struct {
    format: u32,
    input_ptr: [*]allowzero const u8,
    input_len: usize,
    section: u32,
    target: u32,
    expected_rows: u32,
    expected_columns: u32,
    action: u32,
    index: u32,
    layout: u32,
    /// Only after validateRequest and validateAddress have succeeded.
    pub fn input(self: Request) []const u8 {
        const pointer: [*]const u8 = @ptrCast(self.input_ptr);
        return pointer[0..self.input_len];
    }
};

pub fn command(action: u32, index: u32) !plan.Command {
    return @import("created_table_grid_request.zig").decode(action, index);
}

/// All scalar checks precede even forming an input slice.
pub fn validateRequest(r: Request) !void {
    if (r.format != 1 and r.format != 2) return error.InvalidDocumentFormat;
    if (r.input_len == 0 or r.input_len > max_input_bytes) return error.LimitExceeded;
    if (r.layout > 1 or (r.format == 2 and r.layout != 0)) return error.InvalidSourceTableGridLayout;
    const cmd = try command(r.action, r.index);
    if (r.section >= (if (r.format == 1) @as(u32, 1024) else 4096)) return error.InvalidSection;
    const checked = try plan.create(r.expected_rows, r.expected_columns, cmd, if (r.format == 1) 100_000 else 4096);
    if (r.format == 1 and (r.expected_rows > 65535 or r.expected_columns > 65535 or checked.rows > 65535 or checked.columns > 65535)) return error.LimitExceeded;
}

/// Native callers supply readable storage; WASM additionally checks linear memory.
/// The optional bound is also usable by native boundary tests.
pub fn validateAddress(address: usize, len: usize, memory_bytes: ?usize) !void {
    if (address == 0) return error.InvalidSourceTableGridPointer;
    const end = std.math.add(usize, address, len) catch return error.LimitExceeded;
    if (memory_bytes) |bound| if (end > bound) return error.InvalidSourceTableGridPointer;
}
fn memoryBound() ?usize {
    if (builtin.cpu.arch == .wasm32 or builtin.cpu.arch == .wasm64) {
        return std.math.mul(usize, @wasmMemorySize(0), 65536) catch std.math.maxInt(usize);
    }
    return null;
}

pub const Output = struct {
    allocator: std.mem.Allocator,
    bytes: ?[]u8 = null,
    pub fn clear(self: *Output) void {
        if (self.bytes) |bytes| self.allocator.free(bytes);
        self.bytes = null;
    }
    pub fn ptr(self: *const Output) usize {
        return if (self.bytes) |bytes| @intFromPtr(bytes.ptr) else 0;
    }
    pub fn len(self: *const Output) usize {
        return if (self.bytes) |bytes| bytes.len else 0;
    }
    pub fn replace(self: *Output, r: Request) !void {
        return self.replaceWith(r, transform);
    }
    /// Converter borrows input and returns a distinct owned allocation.
    pub fn replaceWith(self: *Output, r: Request, comptime convert: anytype) !void {
        const previous = self.bytes;
        self.bytes = null;
        defer if (previous) |bytes| self.allocator.free(bytes);
        try validateRequest(r);
        try validateAddress(@intFromPtr(r.input_ptr), r.input_len, memoryBound());
        const candidate = try convert(self.allocator, r);
        errdefer self.allocator.free(candidate);
        if (candidate.len == 0 or candidate.len > max_output_bytes) return error.LimitExceeded;
        self.bytes = candidate;
    }
};
fn transform(a: std.mem.Allocator, r: Request) ![]u8 {
    const input = r.input();
    const cmd = try command(r.action, r.index);
    return switch (r.format) {
        1 => @import("../hwp5/edit/source_table_grid_file.zig").transform(a, input, .{
            .section = r.section,
            .table_node = r.target,
            .expected_rows = r.expected_rows,
            .expected_columns = r.expected_columns,
            .command = cmd,
            .layout = if (r.layout == 0) .spec6 else .observed8,
        }, .{ .max_input_bytes = max_input_bytes, .max_output_bytes = max_output_bytes }),
        2 => @import("../hwpx/source_table_grid_file.zig").transform(a, input, .{
            .section = r.section,
            .target = .{ .element = r.target },
            .expected_rows = r.expected_rows,
            .expected_columns = r.expected_columns,
            .command = cmd,
        }, .{ .max_input_bytes = max_input_bytes, .max_output_bytes = max_output_bytes }),
        else => error.InvalidDocumentFormat,
    };
}
