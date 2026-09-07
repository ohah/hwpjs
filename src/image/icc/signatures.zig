const std = @import("std");
pub const ProfileClass = enum { input, display, output, device_link, color_space, abstract, named_color };
pub fn profileClass(value: [4]u8) !ProfileClass {
    const names = [_][4]u8{ "scnr".*, "mntr".*, "prtr".*, "link".*, "spac".*, "abst".*, "nmcl".* };
    for (names, 0..) |name, i| if (std.mem.eql(u8, &value, &name)) return @enumFromInt(i);
    return error.InvalidIccProfileClass;
}
/// ICC.1 v2 Table 13 / v4 Table 19. Exact case and trailing spaces matter.
pub fn channels(value: [4]u8) !u8 {
    const three = [_][4]u8{ "XYZ ".*, "Lab ".*, "Luv ".*, "YCbr".*, "Yxy ".*, "RGB ".*, "HSV ".*, "HLS ".*, "CMY ".* };
    for (three) |name| if (std.mem.eql(u8, &value, &name)) return 3;
    if (std.mem.eql(u8, &value, "GRAY")) return 1;
    if (std.mem.eql(u8, &value, "CMYK")) return 4;
    if (std.mem.eql(u8, value[1..], "CLR")) {
        if (value[0] >= '2' and value[0] <= '9') return value[0] - '0';
        if (value[0] >= 'A' and value[0] <= 'F') return value[0] - 'A' + 10;
    }
    return error.InvalidIccColorSpace;
}
pub fn isPcs(value: [4]u8) bool {
    return std.mem.eql(u8, &value, "XYZ ") or std.mem.eql(u8, &value, "Lab ");
}
pub fn platform(value: [4]u8, allow_taligent: bool) !void {
    if (std.mem.allEqual(u8, &value, 0)) return;
    const names = [_][4]u8{ "APPL".*, "MSFT".*, "SGI ".*, "SUNW".* };
    for (names) |name| if (std.mem.eql(u8, &value, &name)) return;
    if (allow_taligent and std.mem.eql(u8, &value, "TGNT")) return;
    return error.InvalidIccPlatform;
}
