const Document = @import("parser.zig").Document;
/// Observed section presentation gradient: preserve its unused image ID 0.
/// This is not a general PIT_BINDATA zero sentinel or a rule for other fills.
pub fn inactiveGradientImage(doc: Document, index: usize) bool {
    const n = doc.nodes[index];
    if (n.value != .binary_id or n.value.binary_id != 0 or n.item_id != 0x401e) return false;
    const fill_index = n.parent orelse return false;
    const fill = doc.nodes[fill_index];
    if (fill.value != .set or fill.value.set.id != 0x0266 or fill.item_id != 0x0266) return false;
    const presentation_index = fill.parent orelse return false;
    const presentation = doc.nodes[presentation_index];
    if (presentation.value != .set or presentation.value.set.id != 0x0219 or presentation.item_id != 0x0219 or presentation.parent != 0) return false;
    if (doc.nodes[0].value != .set or doc.nodes[0].value.set.id != 0x021b) return false;
    var flag: ?u32 = null;
    var child = fill_index + 1;
    while (child < fill.subtree_end) : (child = doc.nodes[child].subtree_end) {
        const item = doc.nodes[child];
        if (item.item_id != 0x4001) continue;
        if (flag != null or item.wire_type != 9 or item.value != .integer) return false;
        flag = item.value.integer;
    }
    return flag != null and flag.? == 4;
}
