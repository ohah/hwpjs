//! Known direct-path properties retain raw UTF-16 units, including noncanonical values.
const std = @import("std");
const schema = @import("../body/form_schema.zig");
pub const Field = struct { field: schema.Field, kind: @import("../body/form_property.zig").Kind, units: []u16 };
pub const Row = struct { control_node: usize, object_node: usize, known_nodes: usize, deferred_nodes: usize, fields: []Field };
pub const max_units = 1_000_000;
pub const max_fields = 100_000;
const Budget = struct { units: usize = max_units, fields: usize = max_fields };

pub fn deinit(a: std.mem.Allocator, rows: []Row) void {
    for (rows) |row| {
        for (row.fields) |field| a.free(field.units);
        a.free(row.fields);
    }
    a.free(rows);
}

pub fn read(a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version) ![]Row {
    return readBounded(a, bytes, version, .{});
}

fn readBounded(a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, budget: Budget) ![]Row {
    if (budget.units > max_units or budget.fields > max_fields) return error.InvalidFormSnapshotBudget;
    var tree = try @import("source_tree.zig").parse(a, bytes, version, .{});
    defer tree.deinit(a);
    var forms = try @import("../body/form_links.zig").collectObservedUnits(a, tree, .{});
    defer forms.deinit(a);
    var result: std.ArrayList(Row) = .empty;
    errdefer {
        for (result.items) |row| {
            for (row.fields) |field| a.free(field.units);
            a.free(row.fields);
        }
        result.deinit(a);
    }
    var total_units: usize = 0;
    var total_fields: usize = 0;
    for (forms.forms.forms) |form| {
        const report = try schema.inspectObserved(form.properties, form.envelope.kind());
        var fields: std.ArrayList(Field) = .empty;
        errdefer {
            for (fields.items) |field| a.free(field.units);
            fields.deinit(a);
        }
        for (report.fields, 0..) |index, ordinal| {
            const property = form.properties.nodes[index orelse continue].property;
            if (property.kind == .set or property.value.len % 2 != 0) return error.InvalidFormSnapshotProperty;
            const count = property.value.len / 2;
            if (count > budget.units - total_units or total_fields == budget.fields) return error.FormPropertySnapshotLimit;
            const units = try a.alloc(u16, count);
            errdefer a.free(units);
            for (units, 0..) |*unit, i| unit.* = std.mem.readInt(u16, property.value[i * 2 ..][0..2], .little);
            try fields.append(a, .{ .field = @fromBackingInt(@intCast(ordinal)), .kind = property.kind, .units = units });
            total_units += count;
            total_fields += 1;
        }
        try result.ensureUnusedCapacity(a, 1);
        const owned = try fields.toOwnedSlice(a);
        result.appendAssumeCapacity(.{ .control_node = form.control_node, .object_node = form.object_node, .known_nodes = report.known_nodes, .deferred_nodes = report.deferred_nodes, .fields = owned });
    }
    return result.toOwnedSlice(a);
}

test "HWP5 form property snapshot owns observed direct fields through every allocation failure" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/calendar_monthly.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    const expected = try read(a, bytes, source.header.version());
    defer deinit(a, expected);
    try std.testing.expectEqual(@as(usize, 4), expected.len);
    var unit_count: usize = 0;
    var field_count: usize = 0;
    for (expected) |row| {
        try std.testing.expect(row.known_nodes > 0);
        var found = false;
        for (row.fields) |field| {
            unit_count += field.units.len;
            field_count += 1;
            if (field.field == .name) {
                try std.testing.expect(field.kind == .wstring and field.units.len > 0);
                found = true;
            }
        }
        try std.testing.expect(found);
    }
    const exact = try readBounded(a, bytes, source.header.version(), .{ .units = unit_count, .fields = field_count });
    defer deinit(a, exact);
    try std.testing.expectEqualDeep(expected, exact);
    try std.testing.expectError(error.FormPropertySnapshotLimit, readBounded(a, bytes, source.header.version(), .{ .units = unit_count - 1 }));
    try std.testing.expectError(error.FormPropertySnapshotLimit, readBounded(a, bytes, source.header.version(), .{ .fields = field_count - 1 }));
    try std.testing.expectError(error.InvalidFormSnapshotBudget, readBounded(a, bytes, source.header.version(), .{ .units = max_units + 1 }));
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, wanted: []const Row) !void {
            const actual = try read(allocator, raw, version);
            defer deinit(allocator, actual);
            try std.testing.expectEqualDeep(wanted, actual);
        }
    }.run, .{ bytes, source.header.version(), expected });
}
