import SwiftUI

extension TimerView {
    /// The set table's columns after SET, as its header writes them. INCL shows when a set has an
    /// incline or the exercise is a treadmill, walk or run, so a bench never gets one.
    nonisolated static func setColumns(_ step: ExerciseStep, inclines: [Double?]) -> [String] {
        let treadmill = Library.shared.group(step.exercise.key).map { [.treadmill, .walk, .run].contains($0) } ?? false
        let incline = treadmill || inclines.contains { $0 != nil }
        return ((step.hasSetLoad ? [step.shortUnit] : []) + (incline ? ["Incl"] : []) + (step.countLabel.map { [$0] } ?? []))
            .map { $0.uppercased() }
    }
}

/// A set row's incline: −/+ by 0.5 % on the row being set, the value alone on the others. Apart from
/// the row the clock rebuilds ten times a second; narrower than the load's stepper to fit 390 pt.
struct SetInclineCell: View, Equatable {
    static let width: CGFloat = 88

    let incline: Double?
    let number: Int
    let editable: Bool
    let onTint: Bool
    let nudge: (Double) -> Void

    static func == (a: Self, b: Self) -> Bool {
        a.incline == b.incline && a.number == b.number && a.editable == b.editable && a.onTint == b.onTint
    }

    var body: some View {
        HStack(spacing: 0) {
            if editable { button("minus", "less") { nudge(-$0) } }
            Text(incline.map(Format.number) ?? "—")
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .frame(width: 28)
                .accessibilityLabel("Set \(number) incline")
                .accessibilityValue(incline.map(Format.number) ?? "none")
            if editable { button("plus", "more") { nudge($0) } }
        }
        .frame(width: Self.width)
    }

    private func button(_ symbol: String, _ word: String, action: @escaping (Double) -> Void) -> some View {
        RepeatButton(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .bold))
                .frame(width: 28, height: 38)
                .background(onTint ? Brand.surface : Brand.coralSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(onTint ? Brand.brandLine : .clear))
                .foregroundStyle(Brand.coralInk)
                .frame(width: 30, height: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Set \(number) incline, \(word)")
    }
}
