import Foundation

/// The client's side of coaching. Fetched with every sync (launch, foreground, pull to refresh) and
/// cached on disk like the rest. Nothing here raises an alert: until migration 0008 is applied the
/// tables do not exist, and a phone with no coach should not hear about it.
extension Store {
    /// The coach you train with now; one at a time in practice, the newest link if there are more.
    var coach: CoachLink? { coaching.links.first(where: \.isActive) }

    var coachName: String? { coach.map { Coaching.name(of: $0.coach, in: coaching) } }

    /// What the home section lists.
    var coachAssignments: [Assignment] { Coaching.active(coaching) }

    func assignment(forWorkout id: String) -> Assignment? {
        Coaching.assignment(forWorkout: id, in: coaching)
    }

    func refreshCoaching() async {
        guard await Supabase.shared.isSignedIn else { return }
        // No links table, no network: keep what the cache had (nothing, before 0008) and say nothing.
        guard let links = try? await Supabase.shared.coachLinks() else { return }
        var next = CoachingState(links: links)
        if links.contains(where: \.isActive) {
            next.assignments = (try? await Supabase.shared.assignments()) ?? coaching.assignments
            let ids = next.assignments.map(\.workoutId)
            next.workouts = (try? await Supabase.shared.assignedWorkouts(ids: ids)) ?? coaching.workouts
            next.names = (try? await Supabase.shared.profileNames(ids: links.map(\.coach))) ?? coaching.names
            next.notes = (try? await Supabase.shared.coachNotes()) ?? coaching.notes
        }
        setCoaching(next)
    }

    /// Accepts an invite and pulls what the new coach has already assigned.
    func acceptCoachInvite(code: String) async throws {
        try await Supabase.shared.acceptCoachInvite(code: code)
        await refreshCoaching()
    }

    /// A note from you to your coach, on an assignment or a session. True once it is on the server.
    @discardableResult
    func postCoachNote(_ text: String, assignment: Assignment?, sessionId: String? = nil) async -> Bool {
        let body = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1000))
        guard !body.isEmpty, let coach = assignment?.coach ?? coach?.coach else { return false }
        guard let note = try? await Supabase.shared.addCoachNote(coach: coach, body: body, assignmentId: assignment?.id, sessionId: sessionId) else {
            return false
        }
        var next = coaching
        next.notes.append(note)
        setCoaching(next)
        return true
    }

    /// Stop training with your coach: the link is ended, and what it opened goes from the phone.
    @discardableResult
    func endCoaching() async -> Bool {
        guard let link = coach else { return false }
        do {
            try await Supabase.shared.endCoaching(coach: link.coach)
        } catch {
            return false
        }
        var next = coaching
        next.links = next.links.map { $0.coach == link.coach ? CoachLink(coach: $0.coach, client: $0.client, status: "ended") : $0 }
        next.assignments.removeAll { $0.coach == link.coach }
        next.notes.removeAll { $0.coach == link.coach }
        setCoaching(next)
        return true
    }

    func setCoaching(_ s: CoachingState) {
        guard s != coaching else { return }
        coaching = s
        writeCoachingCache()
    }

    // MARK: - Cache

    private var coachingCacheURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("coaching-" + cacheName)
    }

    func readCoachingCache() {
        guard let data = try? Data(contentsOf: coachingCacheURL),
              let s = try? Library.shared.decoder.decode(CoachingState.self, from: data) else { return }
        coaching = s
    }

    private func writeCoachingCache() {
        try? JSONEncoder().encode(coaching).write(to: coachingCacheURL, options: .atomic)
    }
}
