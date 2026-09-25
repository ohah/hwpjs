const std = @import("std");
const svg = @import("structure.zig");

test "SVG structure recognizes namespace root without claiming render safety" {
    const a = std.testing.allocator;
    const plain = "<svg xmlns='http://www.w3.org/2000/svg'><rect width='1'/></svg>";
    try std.testing.expect(svg.looksLike(plain));
    try std.testing.expectEqual(@as(usize, 2), (try svg.inspect(a, plain, .{})).elements);
    try std.testing.expectEqual(@as(usize, 2), (try svg.inspect(a, "<?xml version='1.0'?><s:svg xmlns:s='http://www.w3.org/2000/svg'><s:g/></s:svg>", .{})).elements);
    try std.testing.expect(!svg.looksLike("<svgOther/>"));
    for ([_][]const u8{
        "<svg/>",
        "<svg xmlns='urn:wrong'/>",
        "<g xmlns='http://www.w3.org/2000/svg'/>",
        "<svg:svg xmlns:svg='urn:wrong'/>",
    }) |source| try std.testing.expectError(error.InvalidSvgRoot, svg.inspect(a, source, .{}));
    try std.testing.expectError(error.UnsupportedXmlDtd, svg.inspect(a, "<!DOCTYPE svg><svg xmlns='http://www.w3.org/2000/svg'/>", .{}));
    try std.testing.expectError(error.UnresolvedXmlEntity, svg.inspect(a, "<svg xmlns='http://www.w3.org/2000/svg'>&remote;</svg>", .{}));
    try std.testing.expectError(error.LimitExceeded, svg.inspect(a, plain, .{ .xml = .{ .max_elements = 1 } }));
}
