import SwiftUI
import UIKit

/// The brand, carried over from the web app's tokens so the two read as one product — and
/// given a dark twin for each, because iPhones run in Dark Mode and the web app never had to.
/// Every token resolves per appearance; nothing in a view should hard-code a light-only colour.
enum Brand {
    static let coral = Color(hex: 0xFF4D2E)
    /// Coral as text: deep on white, lifted on dark so it keeps its contrast.
    static let coralInk = Color(light: 0xC42A12, dark: 0xFF8A73)
    static let coralSoft = Color(light: 0xFFF0EC, dark: 0x3B1E18)
    static let brandLine = Color(light: 0xFFB4A3, dark: 0x7A3325)
    static let rest = Color(light: 0x1E3A8A, dark: 0x93A8FF)

    static let ink = Color(light: 0x0F172A, dark: 0xF1F5F9)
    static let body = Color(light: 0x475569, dark: 0xCBD5E1)
    static let muted = Color(light: 0x64748B, dark: 0x94A3B8)
    static let faint = Color(light: 0x94A3B8, dark: 0x64748B)
    static let line = Color(light: 0xE2E8F0, dark: 0x263041)
    static let lineSoft = Color(light: 0xF1F5F9, dark: 0x1C2431)

    /// The page, the cards on it, and the wells inside those.
    static let canvas = Color(light: 0xF8FAFC, dark: 0x0B1019)
    static let surface = Color(light: 0xFFFFFF, dark: 0x151C27)
    static let well = Color(light: 0xEEF2F7, dark: 0x1E2733)

    /// The timer is dark in either appearance, as on the web: slate, not black, so the white
    /// clock reads at a glance in a bright gym and an hour on screen is easy on the battery.
    enum Night {
        static let ground = Color(hex: 0x0F172A)
        static let raised = Color(hex: 0x1E293B)
        static let line = Color(hex: 0x334155)
        static let text = Color.white
        static let muted = Color(hex: 0x94A3B8)
        static let rest = Color(hex: 0x6B8CFF)
    }
}

extension Color {
    /// One colour per appearance, resolved by the system as the trait collection changes.
    init(light: UInt32, dark: UInt32) {
        self.init(UIColor { traits in
            UIColor(Color(hex: traits.userInterfaceStyle == .dark ? dark : light))
        })
    }
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

/// A secondary control on the dark timer: raised slate, white label, the same 64pt target.
struct NightButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 18, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: Tap.big)
            .foregroundStyle(Brand.Night.text)
            .background(Brand.Night.raised, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Brand.Night.line))
            .opacity(configuration.isPressed ? 0.75 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// The tiger stripes, without the tiger — the direction Nick picked for the logo. The same three
/// leaning bars as the app icon, so the mark in the app and the one on the home screen match.
struct Stripes: View {
    var body: some View {
        StripesShape().fill(Brand.coral)
            .accessibilityHidden(true)
    }
}

/// The icon's geometry, normalised to the mark's own box: bar offsets and widths as fractions of
/// the width, leaning right at the top.
struct StripesShape: Shape {
    func path(in rect: CGRect) -> Path {
        let lean = 0.074
        let bars: [(x: Double, width: Double)] = [(0, 0.19), (0.353, 0.22), (0.735, 0.19)]
        func point(_ x: Double, _ y: Double) -> CGPoint {
            CGPoint(x: rect.minX + x * rect.width, y: rect.minY + y * rect.height)
        }
        var path = Path()
        for bar in bars {
            path.move(to: point(bar.x + lean, 0))
            path.addLine(to: point(bar.x + bar.width + lean, 0))
            path.addLine(to: point(bar.x + bar.width, 1))
            path.addLine(to: point(bar.x, 1))
            path.closeSubpath()
        }
        return path
    }
}

extension View {
    func cardSurface() -> some View {
        background(Brand.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Brand.line))
    }
}
