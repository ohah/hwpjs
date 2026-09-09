const Weights = @import("sample_axis.zig").Weights;

/// Bilinear reconstruction with replicated-border brackets from Axis.at.
/// Round once after both axes, not after an intermediate horizontal pass.
/// Valid axis weights and u16 input samples keep every product within u64.
pub fn bilinear(top_left: u16, top_right: u16, bottom_left: u16, bottom_right: u16, horizontal: Weights, vertical: Weights) u16 {
    const x: u64 = horizontal.upper_weight;
    const y: u64 = vertical.upper_weight;
    const dx: u64 = horizontal.denominator;
    const dy: u64 = vertical.denominator;
    const top = @as(u64, top_left) * (dx - x) + @as(u64, top_right) * x;
    const bottom = @as(u64, bottom_left) * (dx - x) + @as(u64, bottom_right) * x;
    const denominator = dx * dy;
    return @intCast((top * (dy - y) + bottom * y + denominator / 2) / denominator);
}
