const Reader = @import("../../binary/reader.zig").Reader;
pub const tag: u10 = 84;
pub const Layout = enum { spec24, observed26 };
/// Explicit raw observations retain their existing policy. Default chart reads
/// select the complete spec24 record or the existing observed26 prefix contract.
/// Selection never retries a document or interprets an opaque legacy tail.
pub const Selection = union(enum) { explicit: Layout, structural };
pub const Properties = struct {
    layout: Layout,
    attributes: u32,
    extent_x: i32,
    extent_y: i32,
    bin_data_id: u16,
    border_color: u32,
    border_thickness: i32,
    border_attributes: u32,
    extra: []const u8,
    pub fn parse(bytes: []const u8, layout: Layout) !Properties {
        var r: Reader = .{ .bytes = bytes };
        return .{
            .layout = layout,
            .attributes = if (layout == .spec24) try r.readInt(u16) else try r.readInt(u32),
            .extent_x = try r.readInt(i32),
            .extent_y = try r.readInt(i32),
            .bin_data_id = try r.readInt(u16),
            .border_color = try r.readInt(u32),
            .border_thickness = try r.readInt(i32),
            .border_attributes = try r.readInt(u32),
            .extra = bytes[r.offset..],
        };
    }
    /// Exact24 is the complete specification record. At >=26 retain the
    /// historical observed26 prefix, including arbitrary borrowed trailing bytes.
    /// No new enum/reserved-bit allowlist: those values are raw observations,
    /// with existing validation diagnostics and independent resource admission.
    /// Length25 is ambiguous/incomplete and is never retried as spec24+tail.
    pub fn parseKnown(bytes: []const u8) !Properties {
        const layout: Layout = switch (bytes.len) {
            24 => .spec24,
            0...23, 25 => return error.UnexpectedEnd,
            else => .observed26,
        };
        return parse(bytes, layout);
    }
    pub fn read(bytes: []const u8, selection: Selection) !Properties {
        return switch (selection) {
            .explicit => |layout| parse(bytes, layout),
            .structural => parseKnown(bytes),
        };
    }
    pub fn drawingAspect(self: Properties) u8 {
        return @truncate(self.attributes);
    }
    pub fn hasMoniker(self: Properties) bool {
        return self.attributes & 0x100 != 0;
    }
    pub fn baselineRaw(self: Properties) u7 {
        return @truncate(self.attributes >> 9);
    }
    /// The 16-bit specification layout cannot encode bits 16..21.
    pub fn objectKind(self: Properties) ?u6 {
        return if (self.layout == .spec24) null else @truncate(self.attributes >> 16);
    }
    pub fn borderAttributes(self: Properties) @import("line_attributes.zig").Attributes {
        return .{ .raw = self.border_attributes };
    }
};
