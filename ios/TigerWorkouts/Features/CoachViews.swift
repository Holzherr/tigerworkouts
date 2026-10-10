import SwiftUI

/// The coach's notes on an assignment, on its workout page, with one field to reply.
struct CoachNotesCard: View {
    @Environment(Store.self) private var store
    let assignment: Assignment
    @State private var reply = ""
    @State private var sending = false
    @State private var failed = false

    private var coachName: String { Coaching.name(of: assignment.coach, in: store.coaching) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("From \(coachName)", systemImage: "person.badge.clock")
                .font(.footnote.weight(.bold))
                .foregroundStyle(Brand.coralInk)
            if let note = assignment.note, !note.isEmpty {
                Text(note).font(.callout).foregroundStyle(Brand.ink)
            }
            ForEach(Coaching.notes(for: assignment, in: store.coaching)) { n in
                let mine = n.author == store.user?.id
                VStack(alignment: .leading, spacing: 2) {
                    Text(mine ? "You" : coachName).font(.caption.weight(.bold)).foregroundStyle(Brand.muted)
                    Text(n.body).font(.subheadline).foregroundStyle(Brand.ink)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
            }
            HStack(spacing: 8) {
                TextField("Reply to \(coachName)", text: $reply, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("coach-reply")
                Button {
                    Task { await send() }
                } label: {
                    Image(systemName: "paperplane.fill")
                }
                .disabled(sending || reply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Send reply")
            }
            if failed {
                Text("Not sent. Try again in a moment.").font(.caption).foregroundStyle(Brand.muted)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
        .accessibilityIdentifier("coach-notes")
    }

    private func send() async {
        sending = true
        defer { sending = false }
        failed = !(await store.postCoachNote(reply, assignment: assignment))
        if !failed { reply = "" }
    }
}

/// On the finish screen of a session your coach assigned: an optional note to them about it.
struct FinishCoachNote: View {
    @Environment(Store.self) private var store
    let assignment: Assignment
    let sessionId: String
    @State private var text = ""
    @State private var sent = false
    @State private var sending = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Note to your coach").font(.headline).foregroundStyle(Brand.ink)
            if sent {
                Label("Sent to \(Coaching.name(of: assignment.coach, in: store.coaching))", systemImage: "checkmark.circle.fill")
                    .font(.subheadline)
                    .foregroundStyle(Brand.coralInk)
            } else {
                TextField("How it went, what was hard (optional)", text: $text, axis: .vertical)
                    .lineLimit(2...5)
                    .accessibilityIdentifier("finish-coach-note")
                HStack {
                    Spacer()
                    Button("Send") {
                        Task {
                            sending = true
                            sent = await store.postCoachNote(text, assignment: assignment, sessionId: sessionId)
                            sending = false
                        }
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(Brand.coralInk)
                    .disabled(sending || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }
}

/// Opened by an invite link: who is asking, sign in if needed, then Accept.
struct JoinCoachView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    let code: String

    @State private var invite: CoachInvite?
    @State private var loading = true
    @State private var signingIn = false
    @State private var accepting = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Stripes().frame(width: 52, height: 44).padding(.top, 32)
                if loading {
                    ProgressView()
                } else if let invite {
                    Text("\(invite.name) invited you to train with them")
                        .font(.system(size: 26, weight: .heavy))
                        .foregroundStyle(Brand.ink)
                        .multilineTextAlignment(.center)
                    Text("They will see the workouts you log and can send you workouts and notes. You can stop any time under Me.")
                        .font(.callout)
                        .foregroundStyle(Brand.muted)
                        .multilineTextAlignment(.center)
                    if store.user == nil {
                        Button("Sign in to accept") { signingIn = true }
                            .buttonStyle(BigButtonStyle())
                    } else {
                        Button(accepting ? "Accepting…" : "Accept") { Task { await accept() } }
                            .buttonStyle(BigButtonStyle())
                            .disabled(accepting)
                            .accessibilityIdentifier("accept-invite")
                    }
                } else {
                    Text("This invite link does not work")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(Brand.ink)
                    Text("Ask your coach to send a new one.")
                        .font(.callout)
                        .foregroundStyle(Brand.muted)
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(Brand.coralInk).multilineTextAlignment(.center)
                }
                Spacer()
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: .infinity)
            .background(Brand.canvas)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Not now") { dismiss() } }
            }
            .task {
                invite = try? await Supabase.shared.coachInviteInfo(code: code)
                loading = false
            }
            .sheet(isPresented: $signingIn) {
                SignInView { await store.sync() }
            }
        }
    }

    private func accept() async {
        accepting = true
        defer { accepting = false }
        do {
            try await store.acceptCoachInvite(code: code)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Me → Coach: who coaches you, and the way out.
struct CoachSection: View {
    @Environment(Store.self) private var store
    @State private var confirmStop = false
    @State private var failed = false

    var body: some View {
        if let name = store.coachName {
            Section("Coach") {
                HStack(spacing: 12) {
                    Image(systemName: "person.badge.clock").foregroundStyle(Brand.coral)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(name).foregroundStyle(Brand.ink)
                        Text("Sees the workouts you log and sends you workouts").font(.footnote).foregroundStyle(Brand.muted)
                    }
                }
                Button("Stop training with \(name)", role: .destructive) { confirmStop = true }
                    .accessibilityIdentifier("stop-coaching")
                if failed {
                    Text("Could not reach the server. Try again in a moment.").font(.footnote).foregroundStyle(Brand.muted)
                }
            }
            .confirmationDialog("Stop training with \(name)?", isPresented: $confirmStop, titleVisibility: .visible) {
                Button("Stop training", role: .destructive) {
                    Task { failed = !(await store.endCoaching()) }
                }
                Button("Keep", role: .cancel) {}
            } message: {
                Text("\(name) stops seeing your workouts and can no longer send you new ones.")
            }
        }
    }
}
