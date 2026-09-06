/// ID numbering and null sentinels, independent of record traversal.
pub const Rule = enum { zero_based, one_based, optional_one_based, inherited_char_shape };
pub const Resolution = union(enum) { ordinal: usize, absent, invalid };
pub fn resolve(rule: Rule, id: u32, count: usize) Resolution {
    if ((rule == .optional_one_based and id == 0) or (rule == .inherited_char_shape and id == 0xffffffff)) return .absent;
    const one = rule == .one_based or rule == .optional_one_based;
    if (one and id == 0) return .invalid;
    const ordinal = if (one) id - 1 else id;
    if (ordinal >= count) return .invalid;
    return .{ .ordinal = ordinal };
}
