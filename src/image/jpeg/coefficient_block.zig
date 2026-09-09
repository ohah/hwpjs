/// Owned quantized DCT values in zig-zag order and their frame-grid position.
/// Padded interleaved blocks are included; this is not a pixel rectangle.
pub const Block = struct { component_id: u8, frame_component: usize, x: u32, y: u32, values: [64]i32 };
