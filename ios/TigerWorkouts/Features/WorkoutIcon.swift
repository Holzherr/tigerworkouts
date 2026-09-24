import SwiftUI

/// A workout's icon: two letters on a gradient, derived from its id exactly as the web app does
/// it (`src/features/workouts/icon.ts`), so a workout wears the same colours on both.
struct WorkoutIcon: View {
    let runsheet: Runsheet
    var size: CGFloat = 52

    /// The web app's ten palettes, in its order: the index is part of the contract.
    static let palettes: [(Color, Color)] = [
        (Color(hex: 0xF72585), Color(hex: 0x7209B7)),
        (Color(hex: 0xFF5DA2), Color(hex: 0x3A86FF)),
        (Color(hex: 0x00C9A7), Color(hex: 0x845EC2)),
        (Color(hex: 0x8E2DE2), Color(hex: 0x4A00E0)),
        (Color(hex: 0x4FACFE), Color(hex: 0x00F2FE)),
        (Color(hex: 0xFF7E5F), Color(hex: 0xFEB47B)),
        (Color(hex: 0xC471ED), Color(hex: 0xF64F59)),
        (Color(hex: 0x43E97B), Color(hex: 0x38F9D7)),
        (Color(hex: 0xFF4D2E), Color(hex: 0xFFB020)),
        (Color(hex: 0x5B7CFF), Color(hex: 0xB721FF)),
    ]

    var body: some View {
        let (from, to) = Self.palettes[Int(Self.hash(runsheet.key) % UInt32(Self.palettes.count))]
        RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
            .fill(LinearGradient(colors: [from, to], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(
                // A soft highlight across the top, as the web icon's "glow" style has.
                RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                    .fill(RadialGradient(colors: [.white.opacity(0.28), .clear], center: .top, startRadius: 0, endRadius: size * 0.8))
            )
            .overlay(
                Text(Self.monogram(runsheet.title))
                    .font(.system(size: size * 0.38, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.18), radius: 1, y: 1)
            )
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }

    /// FNV-1a over UTF-16 code units, 32-bit — JavaScript's `charCodeAt` loop, byte for byte.
    static func hash(_ s: String) -> UInt32 {
        var h: UInt32 = 0x811C9DC5
        for unit in s.utf16 {
            h ^= UInt32(unit)
            h = h &* 0x0100_0193
        }
        return h
    }

    private static let skip: Set<String> = ["and", "&", "of", "the", "a", "an", "to", "in", "on", "with", "for", "vs", "x", "×", "–", "-"]

    /// "Swings, incline press & sprints" → SI, "StrongLifts 5×5 A" → S5, "Fran" → F.
    static func monogram(_ title: String) -> String {
        let cleaned = title.replacingOccurrences(of: "[–—/,()]", with: " ", options: .regularExpression)
        let tokens = cleaned.split(whereSeparator: \.isWhitespace).map(String.init).filter { !skip.contains($0.lowercased()) }
        guard let first = tokens.first else { return "?" }
        if tokens.count == 1 { return String(first.prefix(1)).uppercased() }
        return tokens.prefix(2).map { word in
            let c = String(word.prefix(1))
            return c.first?.isNumber == true ? c : c.uppercased()
        }.joined()
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}
