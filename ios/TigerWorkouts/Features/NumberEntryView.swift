import SwiftUI

/// A number to type in, asked for by a tap on it: what it is, its unit, what it is now, and what to
/// do with the new one. One per screen at a time. `unit` and `current` are as stored: a weight is
/// typed in lb when weights show in lb, and `apply` gets it back in kg (U11).
struct NumberEntryRequest: Identifiable {
    let id = UUID()
    var title: String
    var unit: String = ""
    var current: Double?
    var apply: (Double) -> Void
}

/// The keypad for a `NumberEntryRequest`: a field with the decimal pad, prefilled with the number as
/// it is, Set and Cancel.
private struct NumberEntryAlert: ViewModifier {
    @Binding var request: NumberEntryRequest?
    @State private var draft = ""

    func body(content: Content) -> some View {
        content
            .alert(request?.title ?? "", isPresented: Binding(get: { request != nil }, set: { if !$0 { request = nil } }), presenting: request) { r in
                TextField(r.unit.isEmpty ? "Number" : Units.unit(r.unit), text: $draft)
                    .keyboardType(.decimalPad)
                    .accessibilityIdentifier("number-entry")
                Button("Set") {
                    if let v = NumberEntry.parse(draft) { r.apply(Units.stored(v, unit: r.unit)) }
                    request = nil
                }
                Button("Cancel", role: .cancel) { request = nil }
            } message: { r in
                Text(r.unit.isEmpty ? "Type a number." : "In \(Units.unit(r.unit)).")
            }
            .onChange(of: request?.id) { _, id in
                if id != nil { draft = request.flatMap { r in r.current.map { StepSizes.text(Units.shown($0, unit: r.unit)) } } ?? "" }
            }
    }
}

extension View {
    func numberEntry(_ request: Binding<NumberEntryRequest?>) -> some View {
        modifier(NumberEntryAlert(request: request))
    }
}

/// Bodyweight: − and + by 0.5 kg, or by 1 lb when weights show in lb, and a tap on the label to
/// type it (U11). `kg` and what `set` gets are kg; `range` is the kg mode's, lb allows 66 to 551 lb.
struct BodyweightStepper<Label: View>: View {
    var kg: Double
    var range: ClosedRange<Double>
    var set: (Double) -> Void
    @ViewBuilder var label: () -> Label
    @State private var entry: NumberEntryRequest?

    private var bounds: ClosedRange<Double> { Units.lb ? 30...250 : range }

    /// `kg` after a press of + (1) or − (−1), inside `bounds`.
    static func step(_ kg: Double, by presses: Double, in bounds: ClosedRange<Double>) -> Double {
        min(bounds.upperBound, max(bounds.lowerBound, Units.stepped(kg, by: presses, step: 0.5, unit: "kg")))
    }

    var body: some View {
        Stepper {
            Button {
                entry = NumberEntryRequest(title: "Bodyweight", unit: "kg", current: kg) { v in
                    set(min(bounds.upperBound, max(bounds.lowerBound, v)))
                }
            } label: {
                label().frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
            }
            .buttonStyle(.borderless)
            .tint(Brand.ink)
            .accessibilityHint("Type a number")
        } onIncrement: {
            set(Self.step(kg, by: 1, in: bounds))
        } onDecrement: {
            set(Self.step(kg, by: -1, in: bounds))
        }
        .numberEntry($entry)
    }
}
