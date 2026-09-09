// Optional macOS test oracle, not linked into the Zig/WASM product.
// Reads one GIF from stdin; writes ImageIO-decoded, unscaled RGBA frames as JSON.
import Foundation
import ImageIO
import CoreGraphics

let data = FileHandle.standardInput.readDataToEndOfFile()
guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { fatalError("ImageIOSource") }
var frames: [[String: Any]] = []
for index in 0..<CGImageSourceGetCount(source) {
    guard let image = CGImageSourceCreateImageAtIndex(source, index, nil) else { fatalError("ImageIOFrame") }
    let width = image.width, height = image.height
    guard width > 0, height > 0, width <= 16384, height <= 16384,
          width * height <= 16 * 1024 * 1024 else { fatalError("OracleSizeLimit") }
    var rgba = [UInt8](repeating: 0, count: width * height * 4)
    rgba.withUnsafeMutableBytes { buffer in
        guard let context = CGContext(data: buffer.baseAddress, width: width, height: height,
                                      bitsPerComponent: 8, bytesPerRow: width * 4,
                                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)
        else { fatalError("OracleContext") }
        context.setBlendMode(.copy)
        context.interpolationQuality = .none
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    }
    frames.append(["width": width, "height": height, "rgba": Data(rgba).base64EncodedString()])
}
let output = try JSONSerialization.data(withJSONObject: frames, options: [.sortedKeys])
FileHandle.standardOutput.write(output)
