import SwiftUI

/// The brand, carried over from the web app's tokens so the two read as one product.
enum Brand {
    static let coral = Color(red: 1.0, green: 0.302, blue: 0.180)      // #ff4d2e
    static let coralInk = Color(red: 0.769, green: 0.165, blue: 0.071) // #c42a12
    static let coralSoft = Color(red: 1.0, green: 0.941, blue: 0.925)  // #fff0ec
    static let rest = Color(red: 0.118, green: 0.227, blue: 0.541)     // #1e3a8a
    static let ink = Color(red: 0.059, green: 0.090, blue: 0.165)      // #0f172a
    static let body = Color(red: 0.278, green: 0.333, blue: 0.412)     // #475569
    static let muted = Color(red: 0.392, green: 0.455, blue: 0.545)    // #64748b
    static let line = Color(red: 0.886, green: 0.910, blue: 0.941)     // #e2e8f0
    static let canvas = Color(red: 0.973, green: 0.980, blue: 0.988)   // #f8fafc
}

/// Buttons you can hit while moving. Nick's note from the gym was that 44pt is not enough when
/// you are out of breath and the phone is on a bench, so the in-session controls are 64.
enum Tap {
    static let big: CGFloat = 64
    static let regular: CGFloat = 52
}

struct BigButtonStyle: ButtonStyle {
    var tint: Color = Brand.coral
    var filled = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 18, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: Tap.big)
            .foregroundStyle(filled ? .white : tint)
            .background(filled ? tint : tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(filled ? .clear : tint.opacity(0.35)))
            .opacity(configuration.isPressed ? 0.75 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// The tiger stripes, without the tiger — the direction Nick picked for the logo rethink.
struct Stripes: View {
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 0) {
                ForEach(0..<4, id: \.self) { i in
                    Rectangle().fill(i.isMultiple(of: 2) ? Brand.coral : .clear)
                        .frame(width: geo.size.width / 4)
                }
            }
        }
        .frame(height: height)
        .clipShape(Capsule())
    }
}

extension View {
    func cardSurface() -> some View {
        background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Brand.line))
    }
}
