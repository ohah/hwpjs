const Document = @import("parser.zig").Document;
const rules = @import("../docinfo/reference_rules.zig");
/// PIT_BINDATA is an explicit 1-based reference, including nested sets/arrays.
pub fn validate(doc: Document, count: usize) !usize {
    var checked: usize = 0;
    for (doc.nodes) |n| if (n.value == .binary_id) {
        if (rules.resolve(.one_based, n.value.binary_id, count) == .invalid) return error.InvalidResourceReference;
        checked += 1;
    };
    return checked;
}
