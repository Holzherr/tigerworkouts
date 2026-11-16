import Foundation
import Testing
@testable import TigerWorkouts

/// A sync replaces the phone's lists with the server's, so the read must be the whole of it and
/// must be the server's.
@Suite("reading the account")
struct SyncReadTests {
    private func rows(_ n: Int, from: Int) -> Data {
        try! JSONSerialization.data(withJSONObject: (from..<(from + n)).map { ["id": "s-\($0)"] })
    }

    @Test("past 1000 rows every page is read; a full last page asks once more")
    func pages() async throws {
        var asked: [Int] = []
        let all = try await Supabase.allPages(size: 1000) { offset, size in
            asked.append(offset)
            return rows(min(size, 2500 - offset), from: offset)
        }
        #expect(all.count == 2500)
        #expect(asked == [0, 1000, 2000])

        var calls = 0
        let exact = try await Supabase.allPages(size: 2) { offset, _ in
            calls += 1
            return rows(offset < 4 ? 2 : 0, from: offset)
        }
        #expect(exact.count == 4 && calls == 3)
    }

    @Test("a page that is not rows fails the read instead of cutting it short")
    func badPage() async {
        await #expect(throws: SupabaseError.self) {
            _ = try await Supabase.allPages(size: 2) { offset, _ in
                offset == 0 ? rows(2, from: 0) : Data("<html>Sign in to Wi-Fi</html>".utf8)
            }
        }
    }

    @Test("a Wi-Fi sign-in page is not the server; JSON and an empty answer are")
    func fromServer() {
        #expect(!Supabase.fromServer(data: Data("<html></html>".utf8), contentType: "text/html; charset=utf-8"))
        #expect(!Supabase.fromServer(data: Data("[]".utf8), contentType: nil))
        #expect(Supabase.fromServer(data: Data("[]".utf8), contentType: "application/json; charset=utf-8"))
        #expect(Supabase.fromServer(data: Data(), contentType: nil))
    }

    @Test("a session leaves the queue only when the server sends its id back")
    func confirmed() {
        #expect(Supabase.confirmed(Data(#"[{"id":"s-1"}]"#.utf8), id: "s-1"))
        #expect(!Supabase.confirmed(Data("[]".utf8), id: "s-1"))
        #expect(!Supabase.confirmed(Data(), id: "s-1"))
    }
}
