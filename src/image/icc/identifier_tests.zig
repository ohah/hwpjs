const std = @import("std");
const t = std.testing;
const header = @import("header.zig");
const ids = @import("header_identifiers.zig");
const sig = @import("signatures.zig");
fn fixture(major: u8) !header.Header {
    var b = [_]u8{0} ** 128;
    b[8] = major;
    b[12..16].* = "mntr".*;
    b[16..20].* = "RGB ".*;
    b[20..24].* = "XYZ ".*;
    b[36..40].* = "acsp".*;
    return header.parse(&b);
}
test "ICC identifier editions, DeviceLink and registry deferral" {
    for ([_]u8{ 2, 4 }) |major| {
        var h = try fixture(major);
        const edition: ids.Edition = if (major == 2) .v2_2001 else .v4_2022;
        try t.expectEqual(@as(u8, 0), (try ids.inspect(h, edition)).registry_fields_deferred);
        try t.expectError(error.IccEditionMismatch, ids.inspect(h, if (major == 2) .v4_2022 else .v2_2001));
        h.platform = "TGNT".*;
        if (major == 2) _ = try ids.inspect(h, edition) else try t.expectError(error.InvalidIccPlatform, ids.inspect(h, edition));
        h.platform = "MSFT".*;
        h.preferred_cmm = "????".*;
        h.manufacturer = "test".*;
        h.model = .{ 0, 0, 0, 1 };
        h.creator = "ABCD".*;
        try t.expectEqual(@as(u8, 4), (try ids.inspect(h, edition)).registry_fields_deferred);
        h.pcs = "CMYK".*;
        try t.expectError(error.InvalidIccPcs, ids.inspect(h, edition));
        h.profile_class = "link".*;
        try t.expectEqual(@as(u8, 4), (try ids.inspect(h, edition)).pcs_channels);
        h.pcs = "nope".*;
        try t.expectError(error.InvalidIccPcs, ids.inspect(h, edition));
    }
}
test "ICC color signatures independent enumerated positives and byte mutations" {
    const names = [_][4]u8{ "XYZ ".*, "Lab ".*, "Luv ".*, "YCbr".*, "Yxy ".*, "RGB ".*, "GRAY".*, "HSV ".*, "HLS ".*, "CMYK".*, "CMY ".*, "2CLR".*, "3CLR".*, "4CLR".*, "5CLR".*, "6CLR".*, "7CLR".*, "8CLR".*, "9CLR".*, "ACLR".*, "BCLR".*, "CCLR".*, "DCLR".*, "ECLR".*, "FCLR".* };
    const counts = [_]u8{ 3, 3, 3, 3, 3, 3, 1, 3, 3, 4, 3, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 };
    for (names, counts) |name, count| {
        try t.expectEqual(count, try sig.channels(name));
        for (0..4) |position| for (0..256) |byte| {
            var mutant = name;
            mutant[position] = @intCast(byte);
            var expected: ?u8 = null;
            for (names, counts) |n, c| if (std.mem.eql(u8, &mutant, &n)) {
                expected = c;
                break;
            };
            if (expected) |c| try t.expectEqual(c, try sig.channels(mutant)) else try t.expectError(error.InvalidIccColorSpace, sig.channels(mutant));
        };
    }
}
test "ICC class and platform exact-byte rejection and all class PCS rules" {
    const classes = [_][4]u8{ "scnr".*, "mntr".*, "prtr".*, "link".*, "spac".*, "abst".*, "nmcl".* };
    for (classes, 0..) |name, index| {
        try t.expectEqual(index, @as(usize, @intFromEnum(try sig.profileClass(name))));
        var h = try fixture(4);
        h.profile_class = name;
        for ([_][4]u8{ "XYZ ".*, "Lab ".*, "RGB ".*, "GRAY".*, "FCLR".* }) |pcs| {
            h.pcs = pcs;
            if (index == 3 or std.mem.eql(u8, &pcs, "XYZ ") or std.mem.eql(u8, &pcs, "Lab ")) {
                _ = try ids.inspect(h, .v4_2022);
            } else try t.expectError(error.InvalidIccPcs, ids.inspect(h, .v4_2022));
        }
        for (0..4) |position| for (0..256) |byte| {
            var mutant = name;
            mutant[position] = @intCast(byte);
            var known = false;
            for (classes) |n| if (std.mem.eql(u8, &mutant, &n)) {
                known = true;
                break;
            };
            if (known) _ = try sig.profileClass(mutant) else try t.expectError(error.InvalidIccProfileClass, sig.profileClass(mutant));
        };
    }
    const platforms = [_][4]u8{ .{ 0, 0, 0, 0 }, "APPL".*, "MSFT".*, "SGI ".*, "SUNW".*, "TGNT".* };
    for ([_]bool{ false, true }) |v2| for (platforms) |name| {
        for (0..4) |position| for (0..256) |byte| {
            var mutant = name;
            mutant[position] = @intCast(byte);
            var known = false;
            for (platforms[0..if (v2) 6 else 5]) |n| if (std.mem.eql(u8, &mutant, &n)) {
                known = true;
                break;
            };
            if (known) try sig.platform(mutant, v2) else try t.expectError(error.InvalidIccPlatform, sig.platform(mutant, v2));
        };
    };
    var h = try fixture(4);
    h.profile_class = "MNTR".*;
    try t.expectError(error.InvalidIccProfileClass, ids.inspect(h, .v4_2022));
    h = try fixture(4);
    h.data_space = "1CLR".*;
    try t.expectError(error.InvalidIccColorSpace, ids.inspect(h, .v4_2022));
}
