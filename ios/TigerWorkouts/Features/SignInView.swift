import AuthenticationServices
import SwiftUI

struct SignInView: View {
    /// Sign in with Apple needs the Paid entitlement set (project.yml ENTITLEMENTS_KIND); a
    /// Personal Team build cannot sign it, so the button stays hidden there. The walkthrough
    /// shows it on the simulator with UITEST_APPLE_SIGN_IN.
    static var offersApple: Bool {
        Bundle.main.object(forInfoDictionaryKey: "TigerEntitlements") as? String == "Paid"
            || ProcessInfo.processInfo.environment["UITEST_APPLE_SIGN_IN"] == "1"
    }

    var onSignedIn: () async -> Void

    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var code = ""
    @State private var password = ""
    /// Hidden behind a link: email codes are the way in, passwords exist for App Review's demo login.
    @State private var usePassword = false
    @State private var sent = false
    @State private var busy = false
    @State private var error: String?
    @State private var webAuth = WebAuth()
    /// The raw nonce of the Apple request in flight; Apple sees only its hash.
    @State private var appleNonce: String?
    /// Seconds until Resend code works again, so a double tap does not trip the email rate limit.
    @State private var resendIn = 0

    @FocusState private var focus: Field?
    private enum Field { case email, code, password }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    VStack(spacing: 14) {
                        Stripes().frame(width: 52, height: 44)
                        Text("Sign in to TigerWorkouts")
                            .font(.system(size: 30, weight: .heavy))
                            .foregroundStyle(Brand.ink)
                        Text("Your workouts and history, the same as on tigerworkouts.com.")
                            .font(.callout)
                            .foregroundStyle(Brand.muted)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 24)

                    if Self.offersApple {
                        SignInWithAppleButton(.continue) { request in
                            let nonce = Supabase.randomNonce()
                            appleNonce = nonce
                            request.requestedScopes = [.email, .fullName]
                            request.nonce = Supabase.sha256(nonce)
                        } onCompletion: { result in
                            Task { await apple(result) }
                        }
                        .signInWithAppleButtonStyle(.black)
                        .frame(height: Tap.big)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .accessibilityIdentifier("sign-in-apple")
                    }

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

                        if usePassword && !sent {
                            field {
                                SecureField("Password", text: $password)
                                    .textContentType(.password)
                                    .focused($focus, equals: .password)
                                    .accessibilityIdentifier("password-field")
                            }
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

                        if usePassword && !sent {
                            Button("Sign in") {
                                Task { await passwordSignIn() }
                            }
                            .buttonStyle(BigButtonStyle())
                            .disabled(busy || !email.contains("@") || password.isEmpty)
                            .opacity(busy ? 0.6 : 1)
                        } else {
                            Button(sent ? "Sign in" : "Email me a code") {
                                Task { sent ? await verify() : await send() }
                            }
                            .buttonStyle(BigButtonStyle())
                            .disabled(busy || (sent ? code.filter(\.isNumber).count < 6 : !email.contains("@")))
                            .opacity(busy ? 0.6 : 1)
                        }

                        if !sent {
                            Button(usePassword ? "Email me a code instead" : "Use a password instead") {
                                usePassword.toggle()
                                password = ""
                                error = nil
                                focus = usePassword ? .password : .email
                            }
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Brand.muted)
                            .frame(minHeight: Tap.regular)
                            .accessibilityIdentifier("use-password")
                        }

                        if sent {
                            HStack {
                                Button("Use a different email") {
                                    sent = false
                                    code = ""
                                    focus = .email
                                }
                                Spacer()
                                Button(resendIn > 0 ? "Resend code in \(resendIn) s" : "Resend code") {
                                    Task { await send() }
                                }
                                .disabled(busy || resendIn > 0)
                                .accessibilityIdentifier("resend-code")
                            }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Brand.coralInk)
                            .frame(minHeight: Tap.regular)
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
            startResendCountdown()
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

    private func passwordSignIn() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            store.user = try await Supabase.shared.signInWithPassword(email: email.trimmingCharacters(in: .whitespaces), password: password)
            password = ""
            await onSignedIn()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func startResendCountdown() {
        resendIn = 30
        Task {
            while resendIn > 0 {
                try? await Task.sleep(for: .seconds(1))
                resendIn -= 1
            }
        }
    }

    private func apple(_ result: Result<ASAuthorization, any Error>) async {
        switch result {
        case .failure(let e as ASAuthorizationError) where e.code == .canceled:
            return
        case .failure(let e):
            error = e.localizedDescription
        case .success(let auth):
            guard let credential = auth.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken, let token = String(data: tokenData, encoding: .utf8),
                  let nonce = appleNonce else {
                error = "Apple did not send a sign-in token. Try again."
                return
            }
            busy = true
            error = nil
            defer { busy = false }
            do {
                store.user = try await Supabase.shared.signInWithApple(idToken: token, nonce: nonce)
                appleNonce = nil
                await onSignedIn()
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
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
