const std = @import("std");
const a = std.testing.allocator;
const hx = @import("hwpx/source_grid_line_cache.zig");
const head = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:opaque'>";
const p = "<p:p><p:linesegarray/></p:p>";
test "Noori cache owner known physical root and nested cell are admitted" {
    for ([_][]const u8{ head ++ p ++ "</s:sec>", head ++ "<p:p><p:run><p:tbl><p:tr><p:tc><p:subList>" ++ p ++ "</p:subList></p:tc></p:tr></p:tbl></p:run></p:p></s:sec>" }) |xml| {
        const result = try hx.write(a, xml, 65536);
        defer a.free(result);
        try std.testing.expect(std.mem.indexOf(u8, result, "linesegarray") == null);
    }
}
test "Noori cache owner foreign and false physical ancestry reject" {
    for ([_][]const u8{ head ++ "<x:opaque>" ++ p ++ "</x:opaque></s:sec>", head ++ "<p:subList>" ++ p ++ "</p:subList></s:sec>", head ++ "<p:switch><p:case>" ++ p ++ "</p:case></p:switch></s:sec>" }) |xml| {
        try std.testing.expectError(error.UnsupportedSourceLineCache, hx.write(a, xml, 65536));
    }
}
test "Noori cache owner H5 whole writer rejects cached paragraph beneath unknown control" {
    try std.testing.expectError(error.UnsupportedSourceLineCache, @import("hwp5/edit/source_grid_line_cache.zig").write(a, @embedFile("testing/noori_unknown_cache_records.bin"), .{ .raw = 0x05000101 }, 1024 * 1024));
}

test "Noori cache owner H5 empty present cache under unknown control is not ownerless" {
    try std.testing.expectError(error.UnsupportedSourceLineCache, @import("hwp5/edit/source_grid_line_cache.zig").write(a, @embedFile("testing/noori_unknown_empty_cache_records.bin"), .{ .raw = 0x05000101 }, 1024 * 1024));
}
