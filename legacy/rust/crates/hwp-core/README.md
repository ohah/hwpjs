# hwp-core

Core HWP file parsing library written in Rust.

This library provides the core functionality for parsing HWP (한글과컴퓨터 한/글) files.
The file reading interface is abstracted as a trait to allow different implementations
for different environments (React Native, Node.js, etc.).

## Usage

```rust
use hwp_core::{HwpParser, FileReader};

// Implement FileReader for your environment
struct MyFileReader;

impl FileReader for MyFileReader {
    fn read(&self, path: &str) -> Result<Vec<u8>, String> {
        // Your file reading implementation
        Ok(vec![])
    }
}

// Use the parser
let parser = HwpParser::new();
let reader = MyFileReader;
let result = parser.parse(&reader, "document.hwp");
```

## Status

This is currently a placeholder implementation. The actual HWP parsing logic
will be implemented in future iterations.

