const std = @import("std");
/// Names are their exact wire signatures; this enum owns the presence vocabulary.
pub const Name = enum { desc, cprt, wtpt, chad, A2B0, A2B1, A2B2, B2A0, B2A1, B2A2, gamt, clrt, clot, pseq, ncl2, rXYZ, gXYZ, bXYZ, rTRC, gTRC, bTRC, kTRC };
pub const Set = std.EnumSet(Name);
pub fn identify(signature: [4]u8) ?Name {
    inline for (std.meta.fields(Name)) |field| {
        if (std.mem.eql(u8, &signature, field.name)) return @enumFromInt(field.value);
    }
    return null;
}
