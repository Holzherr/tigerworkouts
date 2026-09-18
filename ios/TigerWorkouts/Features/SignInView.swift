import AuthenticationServices
import SwiftUI

struct SignInView: View {
    var onSignedIn: () async -> Void

    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var code = ""
    @State private var sent = false
    @State private var busy = false
    @State private var error: String?
    @State private var webAuth = WebAuth()

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("you@example.com", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .disabled(sent)

                    if sent {
                        TextField("6-digit code", text: $code)
                            .textContentType(.oneTimeCode)
                            .keyboardType(.numberPad)
                    }

                    Button(sent ? "Verify" : "Email me a code") {
                        Task { sent ? await verify() : await send() }
                    }
                    .disabled(busy || (sent ? code.count < 6 : !email.contains("@")))
                } header: {
                    Text("Sign in")
                } footer: {
                    Text("A six-digit code by email. Same account as tigerworkouts.com, same history.")
                }

                Section {
                    Button("Continue with Google") {
                        Task { await google() }
                    }
                    .disabled(busy)
                } footer: {
                    Text("Google needs tigerworkouts://auth listed under Supabase → Authentication → URL Configuration. If it bounces back, use the email code.")
                }

                if let error {
                    Section {
                        Text(error).foregroundStyle(.red).font(.footnote)
                    }
                }
            }
            .navigationTitle("Sign in")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .disabled(busy)
        }
    }

    private func send() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await Supabase.shared.sendEmailCode(to: email.trimmingCharacters(in: .whitespaces))
            sent = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func verify() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            store.user = try await Supabase.shared.verifyEmailCode(email: email.trimmingCharacters(in: .whitespaces), code: code)
            await onSignedIn()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func google() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            let url = await Supabase.shared.googleAuthURL()
            let callback = try await webAuth.start(url: url, scheme: "tigerworkouts")
            store.user = try await Supabase.shared.completeOAuth(callback: callback)
            await onSignedIn()
            dismiss()
        } catch let e as ASWebAuthenticationSessionError where e.code == .canceledLogin {
            // Backing out of the sheet is not an error worth showing.
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// ASWebAuthenticationSession wants a UIKit anchor and a delegate; this is the smallest wrapper
/// that gives it both and hands back an async result.
@MainActor
final class WebAuth: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    func start(url: URL, scheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callback, error in
                if let callback {
                    continuation.resume(returning: callback)
                } else {
                    continuation.resume(throwing: error ?? SupabaseError(message: "Sign-in was cancelled"))
                }
            }
            // Use the shared cookie jar, so a Google session already open in Safari carries over.
            session.prefersEphemeralWebBrowserSession = false
            session.presentationContextProvider = self
            self.session = session
            session.start()
        }
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scene = UIApplication.shared.connectedScenes.first { $0.activationState == .foregroundActive } as? UIWindowScene
            return scene?.keyWindow ?? ASPresentationAnchor()
        }
    }
}
