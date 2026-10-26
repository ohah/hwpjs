//! Optional current-reference JSON contract. IDs/epochs stay lossless strings.
const std = @import("std");
pub const Reference = @import("../hwp5/edit/created_table_paragraphs.zig").Reference;
pub const Wire = struct {
    epoch: []const u8,
    kind: enum { original, generated, cell },
    section: u32,
    id: []const u8,
    row: u32,
    column: u32,
    pub fn deinit(self: Wire, a: std.mem.Allocator) void {
        a.free(self.epoch);
        a.free(self.id);
    }
};

fn unsigned(bytes: []const u8) !u64 {
    if (bytes.len == 0 or bytes.len > 20 or (bytes.len > 1 and bytes[0] == '0')) return error.InvalidCurrentReference;
    for (bytes) |byte| if (byte < '0' or byte > '9') return error.InvalidCurrentReference;
    return std.fmt.parseInt(u64, bytes, 10) catch error.InvalidCurrentReference;
}

pub fn encode(a: std.mem.Allocator, reference: Reference, epoch: u64) !Wire {
    if (epoch == 0) return error.InvalidCurrentReference;
    const section = switch (reference) {
        .source => |s| s.section,
        .created_cell => |p| p.section,
    };
    const section32 = std.math.cast(u32, section) orelse return error.LimitExceeded;
    const epoch_text = try std.fmt.allocPrint(a, "{d}", .{epoch});
    errdefer a.free(epoch_text);
    const id: u64 = switch (reference) {
        .source => |s| switch (s.host) {
            .original_node => |v| v,
            .generated_instance => |v| v,
        },
        .created_cell => |p| p.table,
    };
    const kind: @FieldType(Wire, "kind") = switch (reference) {
        .source => |s| switch (s.host) {
            .original_node => .original,
            .generated_instance => .generated,
        },
        .created_cell => .cell,
    };
    if (kind != .original and id == 0) return error.InvalidCurrentReference;
    return .{ .epoch = epoch_text, .kind = kind, .section = section32, .id = try std.fmt.allocPrint(a, "{d}", .{id}), .row = if (reference == .created_cell) reference.created_cell.row else 0, .column = if (reference == .created_cell) reference.created_cell.column else 0 };
}

pub fn decode(a: std.mem.Allocator, bytes: []const u8, epoch: u64) !Reference {
    if (bytes.len > 1024) return error.LimitExceeded;
    const parsed = std.json.parseFromSlice(Wire, a, bytes, .{ .allocate = .alloc_always }) catch |err| switch (err) {
        error.OutOfMemory => return err,
        else => return error.InvalidCurrentReference,
    };
    defer parsed.deinit();
    const wire = parsed.value;
    const generation = try unsigned(wire.epoch);
    if (generation == 0 or generation != epoch) return error.StaleCurrentReference;
    const id = try unsigned(wire.id);
    if (wire.kind == .cell) {
        if (id == 0) return error.InvalidCurrentReference;
        return .{ .created_cell = .{ .section = wire.section, .table = id, .row = wire.row, .column = wire.column } };
    }
    if (wire.row != 0 or wire.column != 0) return error.InvalidCurrentReference;
    const id32 = std.math.cast(u32, id) orelse return error.InvalidCurrentReference;
    if (wire.kind == .generated and id32 == 0) return error.InvalidCurrentReference;
    return .{ .source = .{ .section = wire.section, .host = if (wire.kind == .original) .{ .original_node = id32 } else .{ .generated_instance = id32 } } };
}
