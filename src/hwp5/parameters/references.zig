const Document = @import("parser.zig").Document;
const rules = @import("../docinfo/reference_rules.zig");
pub const Context = enum { unknown, section_control };
/// Count inspected PIT_BINDATA entries; contextual inactive absence also counts.
pub fn validate(doc: Document, count: usize) !usize {
    return validateInContext(doc, count, .unknown);
}
pub fn validateInContext(doc: Document, count: usize, context: Context) !usize {
    var checked: usize = 0;
    for (doc.nodes, 0..) |n, index| if (n.value == .binary_id) {
        const inactive = context == .section_control and @import("presentation_reference.zig").inactiveGradientImage(doc, index);
        if (!inactive and rules.resolve(.one_based, n.value.binary_id, count) == .invalid) return error.InvalidResourceReference;
        checked += 1;
    };
    return checked;
}
