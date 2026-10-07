import AppKit
import Foundation
// A code-defined app asset using the POS colors, rendered without fonts.
let size = 1024
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 3, hasAlpha: false, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSColor(calibratedRed: 0.03, green: 0.09, blue: 0.17, alpha: 1).setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: CGFloat(size), height: CGFloat(size))).fill()
NSColor(calibratedRed: 1, green: 0.46, blue: 0.16, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 120, y: 120, width: 784, height: 784), xRadius: 160, yRadius: 160).fill()
NSColor.white.setFill()
let b = NSBezierPath()
b.move(to: NSPoint(x: 320, y: 260)); b.line(to: NSPoint(x: 320, y: 764)); b.line(to: NSPoint(x: 520, y: 764))
b.curve(to: NSPoint(x: 704, y: 634), controlPoint1: NSPoint(x: 670, y: 764), controlPoint2: NSPoint(x: 704, y: 714))
b.curve(to: NSPoint(x: 640, y: 522), controlPoint1: NSPoint(x: 704, y: 580), controlPoint2: NSPoint(x: 675, y: 540))
b.curve(to: NSPoint(x: 728, y: 400), controlPoint1: NSPoint(x: 698, y: 505), controlPoint2: NSPoint(x: 728, y: 460))
b.curve(to: NSPoint(x: 520, y: 260), controlPoint1: NSPoint(x: 728, y: 306), controlPoint2: NSPoint(x: 660, y: 260)); b.close(); b.fill()
NSColor(calibratedRed: 1, green: 0.46, blue: 0.16, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 430, y: 560, width: 162, height: 112), xRadius: 48, yRadius: 48).fill()
NSBezierPath(roundedRect: NSRect(x: 430, y: 354, width: 182, height: 120), xRadius: 48, yRadius: 48).fill()
NSGraphicsContext.restoreGraphicsState()
let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
try bitmap.representation(using: .png, properties: [:])!.write(to: directory.appendingPathComponent("AppIcon.png"))
