const std = @import("std");
pub const Kind = enum { description, copyright };
pub fn identify(signature: [4]u8) ?Kind {
    if (std.mem.eql(u8, &signature, "desc")) return .description;
    if (std.mem.eql(u8, &signature, "cprt")) return .copyright;
    return null;
}
