//! Generated continuations never duplicate source section/page/column breaks.
pub fn effective(generated: bool, source_flags: u8) u8 {
    return if (generated) 0 else source_flags;
}
