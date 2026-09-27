import CoreTransferable
import Foundation
import UniformTypeIdentifiers

/// History as CSV, one row per set. A port of `toCsv` in `src/features/results/csv.ts`: the same
/// columns in the same order, so a file from either app reads the same and imports back into the web.
enum CSVExport {
    static let columns = ["date", "workout", "exercise", "exercise_key", "set", "load", "unit", "reps", "duration_seconds", "set_time_seconds", "notes"]

    /// RFC 4180: quote a field holding a comma, a quote or a line break, and double its quotes.
    static func field(_ s: String) -> String {
        s.contains(where: { $0 == "," || $0 == "\"" || $0 == "\n" || $0 == "\r" })
            ? "\"" + s.replacingOccurrences(of: "\"", with: "\"\"") + "\""
            : s
    }

    /// 80 not 80.0, 82.5, 0.125; blank for nothing. Matches the web's rounding to three places.
    static func number(_ v: Double?) -> String {
        guard let v, v.isFinite else { return "" }
        let r = (v * 1000).rounded() / 1000
        return r == r.rounded() ? String(Int(r)) : String(r)
    }

    private static func line(_ fields: [String]) -> String { fields.map(field).joined(separator: ",") }

    /// Every session, oldest first. A session with no exercises (a quick log) is one row with the
    /// exercise columns empty; an exercise with no sets is one row with the set columns empty.
    static func csv(_ results: [SessionResult], exercise: (String) -> (name: String, unit: String)) -> String {
        var rows = [line(columns)]
        for r in results.sorted(by: { $0.startedAt < $1.startedAt }) {
            let head = [r.startedAt, r.displayTitle]
            func tail(_ at: Double? = nil) -> [String] {
                [number(r.durationSec ?? r.activity.map { $0.minutes * 60 }), number(at), r.notes ?? ""]
            }
            if r.steps.isEmpty {
                rows.append(line(head + ["", "", "", "", "", ""] + tail()))
                continue
            }
            for s in r.steps {
                let ex = exercise(s.exerciseKey)
                let sets = Logbook.sets(of: s)
                if sets.isEmpty { rows.append(line(head + [ex.name, s.exerciseKey, "", "", ex.unit, ""] + tail())) }
                for (i, x) in sets.enumerated() {
                    rows.append(line(head + [ex.name, s.exerciseKey, String(i + 1), number(x.load), ex.unit, number(x.reps)] + tail(x.at)))
                }
            }
        }
        return rows.joined(separator: "\n") + "\n"
    }

    /// `tigerworkouts-2026-09-27.csv`
    static func fileName(_ date: Date = Date()) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "tigerworkouts-%04d-%02d-%02d.csv", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}

/// What the share sheet is handed: the file is only written when something asks for it.
struct HistoryCSV: Transferable {
    var results: [SessionResult]

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .commaSeparatedText) { item in
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(CSVExport.fileName())
            let text = CSVExport.csv(item.results) { key in
                let e = Library.shared.exercise(key)
                return (e?.name ?? Library.shared.name(key), e?.unit ?? "")
            }
            try Data(text.utf8).write(to: url, options: .atomic)
            return SentTransferredFile(url)
        }
    }
}
