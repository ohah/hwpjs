const Reader = @import("../../binary/reader.zig").Reader;
const Version = @import("../version.zig").Version;
pub const zone = @import("table_zone.zig");
pub const Row = struct {
    size: u16,
    pub fn read(r: *Reader) !Row {
        return .{ .size = try r.readInt(u16) };
    }
};
pub const Rows = @import("../../binary/record_array.zig").Records(Row, 2);
/// HWPTAG_TABLE payload only. Control properties and cell lists are separate records.
pub const Table = struct {
    flags: u32,
    row_count: u16,
    column_count: u16,
    cell_spacing: i16,
    margins: [4]i16,
    rows: Rows,
    border_fill_id: u16,
    zones: ?zone.Zones,
    extra: []const u8,
    pub fn parse(bytes: []const u8, version: Version) !Table {
        try version.requireSupported();
        var r: Reader = .{ .bytes = bytes };
        var t: Table = undefined;
        t.flags = try r.readInt(u32);
        t.row_count = try r.readInt(u16);
        t.column_count = try r.readInt(u16);
        t.cell_spacing = try r.readInt(i16);
        for (&t.margins) |*m| m.* = try r.readInt(i16);
        t.rows = try Rows.parse(try r.take(@as(usize, t.row_count) * 2));
        t.border_fill_id = try r.readInt(u16);
        t.zones = null;
        if (version.raw >= 0x05000100) {
            const count = try r.readInt(u16);
            t.zones = try zone.Zones.parse(try r.take(@as(usize, count) * 10));
        }
        t.extra = bytes[r.offset..];
        return t;
    }
};
