const parameters = @import("parser.zig");
pub const Result = struct { recognized_set: bool, field_name_utf16: ?[]const u8, parameter_nodes: usize, extra: []const u8 };
/// Observed named-field set, shared by cell fields and bookmark ControlData.
/// Only direct root items are names; strings remain borrowed UTF-16 code units.
pub fn fromDocument(doc: parameters.Document) !Result {
    if (doc.nodes.len == 0 or doc.nodes[0].value != .set) return error.InvalidParameterRoot;
    var result: Result = .{ .recognized_set = doc.nodes[0].value.set.id == 0x021b, .field_name_utf16 = null, .parameter_nodes = doc.nodes.len, .extra = doc.extra };
    if (!result.recognized_set) return result;
    for (doc.nodes) |n| {
        if (n.parent != 0 or n.item_id != 0x4000) continue;
        if (n.value != .string) return error.InvalidNamedFieldType;
        if (result.field_name_utf16 != null) return error.DuplicateNamedFieldName;
        result.field_name_utf16 = n.value.string;
    }
    return result;
}
