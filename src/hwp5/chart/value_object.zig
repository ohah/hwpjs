const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Table = @import("type_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const payloads = @import("cell_value.zig");
const ids = @import("object_ids.zig");
pub const String = struct { object_id: u32, bytes: []const u8, trailer: u8 };
pub const Number = struct { object_id: u32, bits: u64, trailer: u16 };
pub const Value = union(enum) { string: String, number: Number };

/// Shared payload and base references after the caller has checked the type.
/// Raw numbers are never converted to floats; String bytes borrow the input.
pub fn readBody(reader: *Reader, table: *Table, name: []const u8, max_bytes: usize) !payloads.Value {
    var next = reader.*;
    const value = try payloads.read(&next, name, max_bytes);
    try requireType(table, &next, "VtValue\x00", 1);
    try requireType(table, &next, "VtObject\x00", 1);
    reader.* = next;
    return value;
}

/// Selected inline String/Double v1. Failure preserves reader; types may change.
pub fn readObservedV1(reader: *Reader, table: *Table, max_bytes: usize) !Value {
    return read(reader, table, max_bytes, true);
}
pub fn readStringObservedV1(reader: *Reader, table: *Table, max_bytes: usize) !String {
    return (try read(reader, table, max_bytes, false)).string;
}
fn read(reader: *Reader, table: *Table, max_bytes: usize, allow_number: bool) !Value {
    var next = reader.*;
    const id = try ids.readInline(&next);
    const ref = try table.readObserved16(&next);
    const name = ref.declaration.raw_name;
    if (!std.mem.eql(u8, name, "VtString\x00") and !(allow_number and std.mem.eql(u8, name, "VtDouble\x00"))) return error.UnsupportedChartClass;
    if (ref.declaration.version != 1) return error.UnsupportedChartTypeVersion;
    const payload = try readBody(&next, table, name, max_bytes);
    const value: Value = switch (payload) {
        .string => |s| .{ .string = .{ .object_id = id, .bytes = s.bytes, .trailer = s.trailer } },
        .number => |n| .{ .number = .{ .object_id = id, .bits = n.bits, .trailer = n.trailer } },
        .empty => unreachable,
    };
    reader.* = next;
    return value;
}
