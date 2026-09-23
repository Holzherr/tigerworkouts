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

    @FocusState private var focus: Field?
    private enum Field { case email, code }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    VStack(spacing: 14) {
                        Stripes().frame(width: 52, height: 44)
                        Text("Sign in to Tiger")
                            .font(.system(size: 30, weight: .heavy))
                            .foregroundStyle(Brand.ink)
                        Text("Your workouts and history, the same as on tigerworkouts.com.")
                            .font(.callout)
                            .foregroundStyle(Brand.muted)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 24)

                    Button {
                        Task { await google() }
                    } label: {
                        HStack(spacing: 10) {
                            Text("G")
                                .font(.system(size: 20, weight: .heavy, design: .rounded))
                                .foregroundStyle(Brand.coral)
                            Text("Continue with Google")
                        }
                    }
                    .buttonStyle(BigButtonStyle(tint: Brand.ink, filled: false))

                    HStack(spacing: 12) {
                        Rectangle().fill(Brand.line).frame(height: 1)
                        Text("or").font(.footnote).foregroundStyle(Brand.muted)
                        Rectangle().fill(Brand.line).frame(height: 1)
                    }

                    VStack(spacing: 12) {
                        field {
                            TextField("you@example.com", text: $email)
                                .textContentType(.emailAddress)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .focused($focus, equals: .email)
                                .disabled(sent)
                                .foregroundStyle(sent ? Brand.muted : Brand.ink)
                        }

                        if sent {
                            Text("We sent a six-digit code to \(email). It can take a minute.")
                                .font(.footnote)
                                .foregroundStyle(Brand.muted)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            field {
                                TextField("123456", text: $code)
                                    .textContentType(.oneTimeCode)
                                    .keyboardType(.numberPad)
                                    .font(.system(size: 24, weight: .bold, design: .rounded))
                                    .monospacedDigit()
                                    .focused($focus, equals: .code)
                            }
                        }

                        Button(sent ? "Sign in" : "Email me a code") {
                            Task { sent ? await verify() : await send() }
                        }
                        .buttonStyle(BigButtonStyle())
                        .disabled(busy || (sent ? code.filter(\.isNumber).count < 6 : !email.contains("@")))
                        .opacity(busy ? 0.6 : 1)

                        if sent {
                            Button("Use a different email") {
                                sent = false
                                code = ""
                                focus = .email
                            }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Brand.coralInk)
                        }
                    }

                    if let error {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
            }
            .background(Brand.canvas)
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .overlay {
                if busy { ProgressView().controlSize(.large) }
            }
            .onChange(of: sent) { _, isSent in if isSent { focus = .code } }
        }
    }

    private func field<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(.horizontal, 16)
            .frame(height: Tap.big)
            .background(Brand.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Brand.line))
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
