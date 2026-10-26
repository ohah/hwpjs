//! Displayable ordinary Latin terms after command and symbol resolution.
//! Formula revision 1.3 section 1.1.2.3 requires separate handling above nine
//! characters; do not silently assign that unresolved boundary a new meaning.
const std = @import("std");
pub fn isOrdinaryTerm(value: []const u8) bool {
    if (value.len == 0 or value.len > 9) return false;
    for (value) |byte| if (!std.ascii.isAlphabetic(byte)) return false;
    return true;
}
