import Foundation

/// The client's side of coaching (migration 0008). Row-level security decides what comes back: the
/// client reads their own links, assignments and the pair's notes, the assigned workouts and the
/// coach's profile. Until 0008 is applied every call here throws (no such table or function), and
/// the store treats that as "no coach" without telling anyone.
extension Supabase {
    func coachLinks() async throws -> [CoachLink] {
        guard let uid = user?.id else { return [] }
        let (data, _) = try await request("rest/v1/coach_clients?select=coach,client,status&client=eq.\(uid)")
        return try JSONDecoder().decode([CoachLink].self, from: data)
    }

    func assignments() async throws -> [Assignment] {
        guard let uid = user?.id else { return [] }
        let (data, _) = try await request("rest/v1/assignments?select=id,coach,client,workout_id,note,due_on,archived,created_at&client=eq.\(uid)&archived=eq.false&order=created_at.desc")
        return try JSONDecoder().decode([Assignment].self, from: data)
    }

    /// The PT's own rows, which the "workouts: assigned to me" policy opens to the client.
    func assignedWorkouts(ids: [String]) async throws -> [Runsheet] {
        guard !ids.isEmpty else { return [] }
        let list = Set(ids).sorted().map { "\"\($0.replacingOccurrences(of: "\"", with: ""))\"" }.joined(separator: ",")
        let filter = "(\(list))".addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&+#"))) ?? ""
        let (data, _) = try await request("rest/v1/workouts?select=id,data,creator,title,public&id=in.\(filter)")
        return Self.decodeWorkouts(data)
    }

    /// Names from `profiles`, id → name.
    func profileNames(ids: [String]) async throws -> [String: String] {
        guard !ids.isEmpty else { return [:] }
        let (data, _) = try await request("rest/v1/profiles?select=id,name&id=in.(\(Set(ids).sorted().joined(separator: ",")))")
        struct Row: Decodable { var id: String; var name: String? }
        let rows = try JSONDecoder().decode([Row].self, from: data)
        return Dictionary(rows.compactMap { r in r.name.map { (r.id, $0) } }, uniquingKeysWith: { a, _ in a })
    }

    func coachNotes() async throws -> [CoachNote] {
        guard let uid = user?.id else { return [] }
        let (data, _) = try await request("rest/v1/coach_notes?select=id,coach,client,author,session_id,assignment_id,body,created_at&client=eq.\(uid)&order=created_at.asc")
        return try JSONDecoder().decode([CoachNote].self, from: data)
    }

    /// Posts a note from the client; returns the row as stored.
    func addCoachNote(coach: String, body: String, assignmentId: String?, sessionId: String?) async throws -> CoachNote {
        guard let uid = user?.id else { throw SupabaseError(message: "Not signed in") }
        var row: [String: Any] = ["coach": coach, "client": uid, "author": uid, "body": body]
        if let assignmentId { row["assignment_id"] = assignmentId }
        if let sessionId { row["session_id"] = sessionId }
        let (data, _) = try await request("rest/v1/coach_notes", method: "POST", body: [row], headers: ["Prefer": "return=representation"])
        guard let note = try JSONDecoder().decode([CoachNote].self, from: data).first else {
            throw SupabaseError(message: "Note not saved")
        }
        return note
    }

    /// Anyone with the link may ask, signed in or not. Nil for a code that does not exist.
    func coachInviteInfo(code: String) async throws -> CoachInvite? {
        let (data, _) = try await request("rest/v1/rpc/coach_invite_info", method: "POST", body: ["p_code": code])
        return try? JSONDecoder().decode(CoachInvite.self, from: data)
    }

    func acceptCoachInvite(code: String) async throws {
        _ = try await request("rest/v1/rpc/accept_coach_invite", method: "POST", body: ["p_code": code])
    }

    /// Ends the link from the client's side; the policy allows only status → ended.
    func endCoaching(coach: String) async throws {
        guard let uid = user?.id else { throw SupabaseError(message: "Not signed in") }
        _ = try await request(
            "rest/v1/coach_clients?coach=eq.\(coach)&client=eq.\(uid)",
            method: "PATCH",
            body: ["status": "ended"],
            headers: ["Prefer": "return=minimal"]
        )
    }
}
