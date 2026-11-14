//! Authored chart/OLE switch profile; the shared inline writer owns the caret.
//! 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
const std = @import("std");
pub const Size = struct { width: u32, height: u32 };
// chart_instance remains reserved for source compatibility with r1. ChartType
// derives from ShapeObject, so it has no physical instid attribute.
pub const Identity = struct { chart: u32, chart_instance: u32, ole: u32, ole_instance: u32 };

pub fn validateSize(size: Size) !void {
    if (size.width == 0 or size.height == 0 or size.width > std.math.maxInt(i32) or size.height > std.math.maxInt(i32)) return error.InvalidChartCreateSize;
}

pub fn create(a: std.mem.Allocator, size: Size, ids: Identity, chart_path: []const u8, ole_id: []const u8) ![]u8 {
    try validateSize(size);
    const numbers = [_]u32{ ids.chart, ids.chart_instance, ids.ole, ids.ole_instance };
    for (numbers, 0..) |value, i| {
        if (value == 0) return error.InvalidChartCreateIdentity;
        for (numbers[0..i]) |previous| if (previous == value) return error.InvalidChartCreateIdentity;
    }
    // Package planner supplies ASCII names; never interpolate caller XML.
    for ([_][]const u8{ chart_path, ole_id }) |value| {
        if (value.len == 0 or value.len > 256) return error.InvalidChartCreateIdentity;
        for (value) |c| if (!std.ascii.isAlphanumeric(c) and c != '-' and c != '_' and c != '.' and c != '/') return error.InvalidChartCreateIdentity;
    }
    const object_shape = try objectShape(a, size);
    defer a.free(object_shape);
    const component_shape = try componentShape(a, size);
    defer a.free(component_shape);
    const ole_shape = try std.mem.concat(a, u8, &.{ component_shape, object_shape });
    defer a.free(ole_shape);
    const chart = try std.fmt.allocPrint(a, "<hp:chart id=\"{d}\" chartIDRef=\"{s}\"" ++ common ++ ">{s}</hp:chart>", .{ ids.chart, chart_path, object_shape });
    defer a.free(chart);
    const ole = try std.fmt.allocPrint(a, "<hp:ole id=\"{d}\" instid=\"{d}\" href=\"\" groupLevel=\"0\" binaryItemIDRef=\"{s}\" objectType=\"EMBEDDED\" drawAspect=\"CONTENT\" hasMoniker=\"0\"" ++ common ++ ">{s}</hp:ole>", .{ ids.ole, ids.ole_instance, ole_id, ole_shape });
    defer a.free(ole);
    return std.fmt.allocPrint(a, "<hp:switch xmlns:hp=\"http://www.hancom.co.kr/hwpml/2011/paragraph\" xmlns:hc=\"http://www.hancom.co.kr/hwpml/2011/core\"><hp:case hp:required-namespace=\"http://www.hancom.co.kr/hwpml/2016/ooxmlchart\">{s}</hp:case><hp:default>{s}</hp:default></hp:switch>", .{ chart, ole });
}

// Only fields declared by the official ShapeObject interface are shared.
const common = " zOrder=\"0\" numberingType=\"PICTURE\" textWrap=\"SQUARE\" textFlow=\"BOTH_SIDES\" lock=\"0\" dropcapstyle=\"None\"";
fn componentShape(a: std.mem.Allocator, size: Size) ![]u8 {
    return std.fmt.allocPrint(a, "<hp:offset x=\"0\" y=\"0\"/><hp:orgSz width=\"{d}\" height=\"{d}\"/><hp:curSz width=\"{d}\" height=\"{d}\"/><hp:flip horizontal=\"0\" vertical=\"0\"/><hp:rotationInfo angle=\"0\" centerX=\"{d}\" centerY=\"{d}\" rotateimage=\"1\"/>" ++
        "<hp:renderingInfo><hc:transMatrix e1=\"1\" e2=\"0\" e3=\"0\" e4=\"0\" e5=\"1\" e6=\"0\"/><hc:scaMatrix e1=\"1\" e2=\"0\" e3=\"0\" e4=\"0\" e5=\"1\" e6=\"0\"/><hc:rotMatrix e1=\"1\" e2=\"0\" e3=\"0\" e4=\"0\" e5=\"1\" e6=\"0\"/></hp:renderingInfo>", .{ size.width, size.height, size.width, size.height, size.width / 2, size.height / 2 });
}
fn objectShape(a: std.mem.Allocator, size: Size) ![]u8 {
    return std.fmt.allocPrint(a, "<hp:sz width=\"{d}\" widthRelTo=\"ABSOLUTE\" height=\"{d}\" heightRelTo=\"ABSOLUTE\" protect=\"0\"/>" ++
        "<hp:pos treatAsChar=\"1\" affectLSpacing=\"1\" flowWithText=\"1\" allowOverlap=\"0\" holdAnchorAndSO=\"0\" vertRelTo=\"PARA\" horzRelTo=\"PARA\" vertAlign=\"TOP\" horzAlign=\"LEFT\" vertOffset=\"0\" horzOffset=\"0\"/><hp:outMargin left=\"0\" right=\"0\" top=\"0\" bottom=\"0\"/>", .{ size.width, size.height });
}
