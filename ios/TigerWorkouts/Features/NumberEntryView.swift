import SwiftUI

/// A number to type in, asked for by a tap on it: what it is, its unit, what it is now, and what to
/// do with the new one. One per screen at a time.
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
                TextField(r.unit.isEmpty ? "Number" : r.unit, text: $draft)
                    .keyboardType(.decimalPad)
                    .accessibilityIdentifier("number-entry")
                Button("Set") {
                    if let v = NumberEntry.parse(draft) { r.apply(v) }
                    request = nil
                }
                Button("Cancel", role: .cancel) { request = nil }
            } message: { r in
                Text(r.unit.isEmpty ? "Type a number." : "In \(r.unit).")
            }
            .onChange(of: request?.id) { _, id in
                if id != nil { draft = request?.current.map(StepSizes.text) ?? "" }
            }
    }
}

extension View {
    func numberEntry(_ request: Binding<NumberEntryRequest?>) -> some View {
        modifier(NumberEntryAlert(request: request))
    }
}
