const std = @import("std");

pub const RecordType = enum(u32) {
    header = 0x00000001,
    polybezier = 0x00000002,
    polygon = 0x00000003,
    polyline = 0x00000004,
    polybezierto = 0x00000005,
    polylineto = 0x00000006,
    polypolyline = 0x00000007,
    polypolygon = 0x00000008,
    setwindowextex = 0x00000009,
    setwindoworgex = 0x0000000a,
    setviewportextex = 0x0000000b,
    setviewportorgex = 0x0000000c,
    setbrushorgex = 0x0000000d,
    eof = 0x0000000e,
    setpixelv = 0x0000000f,
    setmapperflags = 0x00000010,
    setmapmode = 0x00000011,
    setbkmode = 0x00000012,
    setpolyfillmode = 0x00000013,
    setrop2 = 0x00000014,
    setstretchbltmode = 0x00000015,
    settextalign = 0x00000016,
    setcoloradjustment = 0x00000017,
    settextcolor = 0x00000018,
    setbkcolor = 0x00000019,
    offsetcliprgn = 0x0000001a,
    movetoex = 0x0000001b,
    setmetargn = 0x0000001c,
    excludecliprect = 0x0000001d,
    intersectcliprect = 0x0000001e,
    scaleviewportextex = 0x0000001f,
    scalewindowextex = 0x00000020,
    savedc = 0x00000021,
    restoredc = 0x00000022,
    setworldtransform = 0x00000023,
    modifyworldtransform = 0x00000024,
    selectobject = 0x00000025,
    createpen = 0x00000026,
    createbrushindirect = 0x00000027,
    deleteobject = 0x00000028,
    anglearc = 0x00000029,
    ellipse = 0x0000002a,
    rectangle = 0x0000002b,
    roundrect = 0x0000002c,
    arc = 0x0000002d,
    chord = 0x0000002e,
    pie = 0x0000002f,
    selectpalette = 0x00000030,
    createpalette = 0x00000031,
    setpaletteentries = 0x00000032,
    resizepalette = 0x00000033,
    realizepalette = 0x00000034,
    extfloodfill = 0x00000035,
    lineto = 0x00000036,
    arcto = 0x00000037,
    polydraw = 0x00000038,
    setarcdirection = 0x00000039,
    setmiterlimit = 0x0000003a,
    beginpath = 0x0000003b,
    endpath = 0x0000003c,
    closefigure = 0x0000003d,
    fillpath = 0x0000003e,
    strokeandfillpath = 0x0000003f,
    strokepath = 0x00000040,
    flattenpath = 0x00000041,
    widenpath = 0x00000042,
    selectclippath = 0x00000043,
    abortpath = 0x00000044,
    comment = 0x00000046,
    fillrgn = 0x00000047,
    framergn = 0x00000048,
    invertrgn = 0x00000049,
    paintrgn = 0x0000004a,
    extselectcliprgn = 0x0000004b,
    bitblt = 0x0000004c,
    stretchblt = 0x0000004d,
    maskblt = 0x0000004e,
    plgblt = 0x0000004f,
    setdibitstodevice = 0x00000050,
    stretchdibits = 0x00000051,
    extcreatefontindirectw = 0x00000052,
    exttextouta = 0x00000053,
    exttextoutw = 0x00000054,
    polybezier16 = 0x00000055,
    polygon16 = 0x00000056,
    polyline16 = 0x00000057,
    polybezierto16 = 0x00000058,
    polylineto16 = 0x00000059,
    polypolyline16 = 0x0000005a,
    polypolygon16 = 0x0000005b,
    polydraw16 = 0x0000005c,
    createmonobrush = 0x0000005d,
    createdibpatternbrushpt = 0x0000005e,
    extcreatepen = 0x0000005f,
    polytextouta = 0x00000060,
    polytextoutw = 0x00000061,
    seticmmode = 0x00000062,
    createcolorspace = 0x00000063,
    setcolorspace = 0x00000064,
    deletecolorspace = 0x00000065,
    glsrecord = 0x00000066,
    glsboundedrecord = 0x00000067,
    pixelformat = 0x00000068,
    drawescape = 0x00000069,
    extescape = 0x0000006a,
    smalltextout = 0x0000006c,
    forceufimapping = 0x0000006d,
    namedescape = 0x0000006e,
    colorcorrectpalette = 0x0000006f,
    seticmprofilea = 0x00000070,
    seticmprofilew = 0x00000071,
    alphablend = 0x00000072,
    setlayout = 0x00000073,
    transparentblt = 0x00000074,
    gradientfill = 0x00000076,
    setlinkedufis = 0x00000077,
    settextjustification = 0x00000078,
    colormatchtotargetw = 0x00000079,
    createcolorspacew = 0x0000007a,
};

pub fn parseType(value: u32) !RecordType {
    return std.enums.fromInt(RecordType, value) orelse error.InvalidEmfRecordType;
}

pub const Record = struct {
    offset: usize,
    kind: RecordType,
    size: u32,
    bytes: []const u8,
    end: usize,
};

pub const Iterator = struct {
    bytes: []const u8,
    offset: usize = 0,

    pub fn next(self: *Iterator) !?Record {
        if (self.offset == self.bytes.len) return null;
        if (self.bytes.len - self.offset < 8) return error.TruncatedEmfRecord;
        const start = self.offset;
        const size = std.mem.readInt(u32, self.bytes[start + 4 ..][0..4], .little);
        if (size < 8 or size % 4 != 0) return error.InvalidEmfRecordSize;
        if (size > self.bytes.len - start) return error.TruncatedEmfRecord;
        const end = start + size;
        const value: Record = .{
            .offset = start,
            .kind = try parseType(std.mem.readInt(u32, self.bytes[start..][0..4], .little)),
            .size = size,
            .bytes = self.bytes[start..end],
            .end = end,
        };
        self.offset = end;
        return value;
    }
};

test "RecordType is the complete official non-contiguous enumeration" {
    const fields = std.meta.fields(RecordType);
    try std.testing.expectEqual(@as(usize, 119), fields.len);
    inline for (fields) |field| {
        const kind = try parseType(field.value);
        try std.testing.expectEqual(field.value, @intFromEnum(kind));
    }
    for ([_]u32{ 0, 0x45, 0x6b, 0x75, 0x7b, std.math.maxInt(u32) }) |value|
        try std.testing.expectError(error.InvalidEmfRecordType, parseType(value));
}

test "record iterator rejects undefined types without advancing" {
    var bytes = [_]u8{0} ** 8;
    std.mem.writeInt(u32, bytes[0..4], 0x45, .little);
    std.mem.writeInt(u32, bytes[4..8], bytes.len, .little);
    var iterator: Iterator = .{ .bytes = &bytes };
    try std.testing.expectError(error.InvalidEmfRecordType, iterator.next());
    try std.testing.expectEqual(@as(usize, 0), iterator.offset);
}
