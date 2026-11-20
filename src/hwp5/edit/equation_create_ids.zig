//! Document-wide primary object/paragraph instance namespace. One stable Map.
const std = @import("std");
const model = @import("../../model/document.zig");
pub fn plan(a: std.mem.Allocator, decoded: []const []u8, document: *const model.Document, pending: []const @import("created_table_values.zig").Values) !u32 {
    if (decoded.len != document.sections.len or pending.len != decoded.len) return error.SourceBindingMismatch;
    var used: std.AutoHashMapUnmanaged(u32, void) = .empty;
    defer used.deinit(a);
    for (decoded) |raw| {
        var it = @import("../record.zig").Iterator.init(raw, .{});
        while (try it.next()) |r| {
            if (r.tag == 66) {
                // Native current model values below also include generated IDs.
                const Header = @import("../body/paragraph_header.zig").Header;
                if (r.payload.len < Header.instance_id_offset + 4) return error.SourceBindingMismatch;
                try reserve(a, &used, std.mem.readInt(u32, r.payload[Header.instance_id_offset..][0..4], .little));
            } else if (try @import("source_object_ids.zig").fromRecord(r)) |id| {
                try reserve(a, &used, id);
            }
        }
    }
    for (document.sections) |s| for (s.paragraphs) |p| try reserve(a, &used, p.instance_id);
    for (pending) |tables| for (tables.entries) |entry| {
        try reserve(a, &used, entry.value.table.instance_id);
        for (entry.value.table.cells) |cell| try reserve(a, &used, cell.paragraph_id);
    };
    var id: u32 = 1;
    while (used.contains(id)) id = std.math.add(u32, id, 1) catch return error.EquationInstanceIdsExhausted;
    return id;
}

fn reserve(a: std.mem.Allocator, used: *std.AutoHashMapUnmanaged(u32, void), id: u32) !void {
    if (used.contains(id)) return;
    if (used.count() >= 2_000_000) return error.LimitExceeded;
    try used.put(a, id, {});
}
/// Validate the actual serializer output, including every pending table/cell.
/// The fresh namespace member must occur once as an object and never elsewhere.
pub fn verify(raw: []const u8, version: @import("../version.zig").Version, id: u32, request: @import("equation_create_request.zig").Request) !void {
    var it = @import("../record.zig").Iterator.init(raw, .{});
    var objects: usize = 0;
    while (try it.next()) |record| {
        if (record.tag == 66) {
            if ((try @import("../body/paragraph_header.zig").Header.parse(record.payload, version)).instance_id == id) return error.EquationCreationVerificationFailed;
        } else if (try @import("source_object_ids.zig").fromRecord(record)) |value| {
            if (value != id) continue;
            if (record.tag != 71 or std.mem.readInt(u32, record.payload[0..4], .little) != @import("../body/control_rules.zig").equation_id) return error.EquationCreationVerificationFailed;
            const common = try @import("../body/object_common.zig").parseControl(try @import("../body/control_header.zig").Header.parse(record.payload));
            if (common.width != request.box.width or common.height != request.box.height) return error.EquationCreationVerificationFailed;
            objects += 1;
        }
    }
    if (objects != 1) return error.EquationCreationVerificationFailed;
}
