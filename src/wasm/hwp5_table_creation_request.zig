//! Explicit wire policy; native planning/validation own IDs and record semantics.
const std = @import("std");
const Session = @import("../hwp5/edit/style_preservation.zig").Session;
const model = @import("../model/created_table.zig");
pub const Request = struct {
    version: u32,
    section: u32,
    paragraph: u32,
    unit: u32,
    rows: u32,
    columns: u32,
    width: u32,
    row_height: u32,
    resources: model.Resources,
    options: @import("../hwp5/edit/created_table_records.zig").Options,
};
pub const Prepared = struct {
    parsed: std.json.Parsed(Request),
    table: model.Table,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        self.table.deinit(a);
        self.parsed.deinit();
    }
    pub fn command(self: *const Prepared) @import("../hwp5/edit/style_preservation.zig").Command {
        const r = self.parsed.value;
        return .{ .stage_table = .{ .section = r.section, .paragraph = r.paragraph, .unit = r.unit, .table = &self.table, .options = r.options } };
    }
};

pub fn parse(a: std.mem.Allocator, bytes: []const u8) !std.json.Parsed(Request) {
    if (bytes.len > 1024 * 1024) return error.LimitExceeded;
    const parsed = std.json.parseFromSlice(Request, a, bytes, .{ .allocate = .alloc_always }) catch |err| switch (err) {
        error.OutOfMemory => return err,
        else => return error.InvalidTableCreationRequest,
    };
    errdefer parsed.deinit();
    if (parsed.value.version != 1) return error.UnsupportedTableCreationRequest;
    _ = try @import("../model/table_creation_plan.zig").create(parsed.value.rows, parsed.value.columns, parsed.value.width, parsed.value.row_height, Session.tableCreationLimits().max_cells);
    return parsed;
}

pub fn prepare(a: std.mem.Allocator, session: *const Session, bytes: []const u8) !Prepared {
    const parsed = try parse(a, bytes);
    errdefer parsed.deinit();
    const r = parsed.value;
    const limit = Session.tableCreationLimits().max_cells;
    const plan = try @import("../model/table_creation_plan.zig").create(r.rows, r.columns, r.width, r.row_height, limit);
    var ids = try session.planTableIdsWithAllocator(a, @as(usize, r.rows) * r.columns);
    defer ids.deinit(a);
    return .{ .parsed = parsed, .table = try model.create(a, ids.identity, ids.instance_id, plan, ids.paragraph_ids, r.resources, limit) };
}
