const Plane = @import("sample_image.zig").Plane;
const Format = @import("sample_restoration.zig").Format;
const Table = @import("quantization.zig").Table;
const dequantization = @import("dequantization.zig");
const idct = @import("idct.zig");

/// Caller supplies an allocated plane and validated table/precision. Quantized
/// coefficients already contain any progressive point-transform restoration.
/// Wholly padded blocks are ignored; visible edges are copied row by row.
pub fn write(plane: *Plane, format: Format, values: [64]i32, table: Table, x: u32, y: u32) !void {
    const visible = plane.extent.clip(x, y) orelse return;
    const samples = try format.block(idct.transform(dequantization.block(values, table)));
    for (0..visible.height) |row| {
        const target = (@as(usize, y) * 8 + row) * plane.extent.width + @as(usize, x) * 8;
        @memcpy(plane.samples[target..][0..visible.width], samples[row * 8 ..][0..visible.width]);
    }
}
