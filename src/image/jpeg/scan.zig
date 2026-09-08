const Reader = @import("../../binary/reader.zig").Reader;
const Frame = @import("frame.zig").Frame;
const Components = @import("components.zig").ScanComponents;
pub const Scan = struct {
    components: Components,
    spectral_start: u8,
    spectral_end: u8,
    approximation_high: u8,
    approximation_low: u8,
};
/// Requires a parsed Frame. Cross-scan progression and active tables are deferred.
pub fn parse(payload: []const u8, frame: Frame) !Scan {
    var r: Reader = .{ .bytes = payload };
    const count = try r.readInt(u8);
    if (count == 0 or count > 4 or count > frame.components.count()) return error.InvalidJpegComponentCount;
    const components = try Components.parse(try r.take(@as(usize, count) * 2));
    const ss = try r.readInt(u8);
    const se = try r.readInt(u8);
    const approximation = try r.readInt(u8);
    if (r.offset != payload.len) return error.InvalidJpegScanLength;
    const ah = approximation >> 4;
    const al = approximation & 15;
    switch (frame.process.mode) {
        .baseline, .sequential => if (ss != 0 or se != 63 or approximation != 0) return error.InvalidJpegScanParameters,
        .progressive => {
            if (ss > 63 or se > 63 or se < ss or (ss == 0 and se != 0) or (ss != 0 and count != 1)) return error.InvalidJpegScanParameters;
            if (ah > 13 or al > 13 or (ah != 0 and ah != al + 1)) return error.InvalidJpegApproximation;
        },
        .lossless => if (ss < 1 or ss > 7 or se != 0 or ah != 0) return error.InvalidJpegScanParameters,
    }
    var previous: ?usize = null;
    var sampling: usize = 0;
    for (0..components.count()) |j| {
        const c = components.get(j).?;
        const maximum: u8 = if (frame.process.mode == .baseline) 1 else 3;
        if (c.dc() > maximum or c.ac() > maximum or (frame.process.mode == .lossless and c.ac() != 0)) return error.InvalidJpegEntropySelector;
        var found: ?usize = null;
        for (0..frame.components.count()) |i| if (frame.components.get(i).?.id == c.id) {
            found = i;
            break;
        };
        const index = found orelse return error.InvalidJpegComponentReference;
        if (previous) |before| if (index <= before) return error.InvalidJpegComponentOrder;
        previous = index;
        const fc = frame.components.get(index).?;
        sampling += @as(usize, fc.horizontal()) * fc.vertical();
    }
    if (count > 1 and sampling > 10) return error.InvalidJpegMcuSampling;
    return .{ .components = components, .spectral_start = ss, .spectral_end = se, .approximation_high = ah, .approximation_low = al };
}
