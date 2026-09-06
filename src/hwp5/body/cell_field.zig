const std = @import("std");
const parameters = @import("../parameters/parser.zig");
const Extension = @import("cell_extension.zig").Extension;
pub const Result = struct { recognized_set: bool, field_name_utf16: ?[]const u8, parameter_nodes: usize, extra: []const u8 };
/// Borrowed name and trailing bytes; temporary parameter nodes are always freed.
pub fn inspect(a: std.mem.Allocator, extension: Extension, options: parameters.Options) !?Result {
    if (!extension.parameterSetMarked()) return null;
    var doc = try parameters.Document.parse(a, extension.remaining, options);
    defer doc.deinit(a);
    var result: Result = .{ .recognized_set = doc.nodes[0].value.set.id == 0x021b, .field_name_utf16 = null, .parameter_nodes = doc.nodes.len, .extra = doc.extra };
    if (!result.recognized_set) return result;
    for (doc.nodes) |n| {
        if (n.parent != 0 or n.item_id != 0x4000) continue;
        if (n.value != .string) return error.InvalidCellFieldType;
        if (result.field_name_utf16 != null) return error.DuplicateCellFieldName;
        result.field_name_utf16 = n.value.string;
    }
    return result;
}
