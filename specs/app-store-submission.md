Status: building

# App Store submission: iPhone app

Nick, 1 Nov 2026: get the iOS app ready for App Store review; Nick presses Submit. This file lists every App Store Connect field with its value or the file that holds it, what was checked against the App Review Guidelines, and what only Nick can do.

Metadata follows fastlane `deliver`'s layout in `ios/fastlane/`, so it can be uploaded with `fastlane deliver` once an App Store Connect API key exists, or pasted by hand.

## Left for Nick

1. **Agreements:** App Store Connect → Business → accept the Paid Apps / Free Apps agreement if a banner asks (a free app needs only the free one; tax and banking only for paid).
2. **Primary language:** App Information → check it is English (U.K.). The metadata is in `ios/fastlane/metadata/en-GB/`. If the app record was made as English (U.S.), either paste the same text there or rename the folder to `en-US`.
3. **Demo account:** App Review Information → Sign-in required: on. User name `review-apple@tigerworkouts.com` (profile "Sam", 5 workouts, 22 sessions to 31 Oct 2026), password from Nick's Keychain item "TigerWorkouts reviewer (Apple)". `review_information/demo_password.txt` holds only that placeholder: replace it locally before any `fastlane deliver` run and never commit the real one (the repo is public). Add a contact phone number too.
4. **Pricing and availability:** Free, or a price; which countries.
5. **Age rating questionnaire:** answers below. Two of them are Nick's call (coach notes and coach-sent workouts).
6. **App Privacy:** enter the answers under "App Privacy" below (Data Types → Get Started). Then Publish.
7. **Screenshots:** drag `ios/fastlane/screenshots/en-GB/*.png` into the 6.9" iPhone slot, in file order.
8. **Build:** pick the newest TestFlight build (uploaded from merged main, see PR) under the 1.0 version.
9. **Submit for Review.** Release option: manual or automatic after approval.
10. **Optional, to automate later uploads:** an App Store Connect API key (Users and Access → Integrations → Team Keys, role App Manager), saved outside the repo. Then `fastlane deliver --skip_binary_upload` pushes all of the metadata and screenshots.

## App Store Connect fields

### App Information

| Field | Value |
|---|---|
| Name (≤ 30) | `en-GB/name.txt`: TigerWorkouts: Gym Timer & Log (30). If the record's name is plain "TigerWorkouts", either is fine. |
| Subtitle (≤ 30) | `en-GB/subtitle.txt`: Guided timer, every set logged (30) |
| Bundle ID | dev.brambruesch.tigerworkouts |
| SKU | whatever the record already has |
| Primary category | Health & Fitness (`primary_category.txt`) |
| Secondary category | Sports (`secondary_category.txt`) |
| Content rights | Does not contain third-party content that needs rights. The catalogue is written descriptions of public workouts with links to their sources; exercise photos and clips were made for TigerWorkouts (`public/media/`). |
| Age rating | see below |
| Privacy Policy URL | https://tigerworkouts.com/privacy/ (`en-GB/privacy_url.txt`) |

### Version 1.0

| Field | Value |
|---|---|
| Promotional text (≤ 170) | `en-GB/promotional_text.txt` (134) |
| Description | `en-GB/description.txt` |
| Keywords (≤ 100) | `en-GB/keywords.txt` (99). No trademarks (no CrossFit, HYROX): guideline 2.3.7. |
| Support URL | https://tigerworkouts.com/support/ (`en-GB/support_url.txt`) |
| Marketing URL | https://tigerworkouts.com/ (`en-GB/marketing_url.txt`) |
| What's New | not shown for a first version; `en-GB/release_notes.txt` for later |
| Copyright | 2026 Brambruesch Ltd (`copyright.txt`) |
| Version | 1.0 (`MARKETING_VERSION` in `ios/project.yml`); build numbers are set by App Store Connect on upload |
| Screenshots, 6.9" iPhone | `ios/fastlane/screenshots/en-GB/`, 8 PNGs at 1320 × 2868. Smaller iPhone sizes are scaled from these by App Store Connect. No iPad: the app is iPhone-only (`TARGETED_DEVICE_FAMILY: "1"`). Retake with `ios/screenshots.sh`. |
| App Review contact | `review_information/`: first and last name, email; phone left blank for Nick |
| Review notes | `review_information/notes.txt` |
| Sign-in information | `review-apple@tigerworkouts.com` / password from Keychain (`review_information/demo_user.txt`, `demo_password.txt` is a placeholder). The app itself needs no account; the notes give the signed-out path first. |

### Age rating answers

All "None" / "No", except:

| Question | Answer |
|---|---|
| Health or wellness topics | Yes (fitness workouts and calorie estimates; no medical treatment information) |
| Medical or treatment information | None |
| Unrestricted web access | No (links open in Safari) |
| Gambling, contests, loot boxes | No |
| User-generated content | **Nick's call.** The only content from other people in the app is workouts and notes from a coach the user joined by invite. There is no public feed. Answering No is defensible; if Yes, App Review may ask for report and block (guideline 1.2); "End coaching" is the block today. |
| Messaging and chat | **Nick's call**, same reason: coach notes between two linked accounts. |
| Advertising | No |
| Parental controls / age assurance | No |

Expected rating: 4+.

### App Privacy (nutrition label)

Derived from the code: `Cloud/Supabase.swift` (sync when signed in), `Support/InAppFeedback.swift` (feedback note to feedback.nickholzherr.com), `Health/Health.swift`. There is no analytics, advertising or crash-reporting SDK, and no third-party package at all. Signed out, nothing leaves the phone except a feedback note the person chooses to send.

Tracking: **No** for every type. "Do you or your third-party partners use data for tracking?" → No.

| Data type (App Store Connect name) | Collected because | Linked to identity | Tracking | Purpose |
|---|---|---|---|---|
| Contact Info → Email Address | sign-in; sent with a feedback note when signed in | Yes | No | App Functionality |
| Contact Info → Name | profile name; the name Sign in with Apple shares | Yes | No | App Functionality |
| Health & Fitness → Health | heart rate during a session and bodyweight from Apple Health, stored with the session when signed in | Yes | No | App Functionality |
| Health & Fitness → Fitness | workouts logged: exercises, loads, reps, times | Yes | No | App Functionality |
| User Content → Customer Support | the in-app feedback note | Yes | No | App Functionality |
| User Content → Other User Content | workouts the user writes; notes to a coach | Yes | No | App Functionality |
| Identifiers → User ID | the Supabase account id | Yes | No | App Functionality |
| Diagnostics → Other Diagnostic Data | sent with a feedback note: screen, recent screens, device model, iOS version, app version, locale, time zone | Yes | No | App Functionality |

Not collected: location, contacts, photos, browsing or search history, purchases, financial info, sensitive info, usage data/product interaction, crash data, performance data, device ID, advertising data.

`ios/TigerWorkouts/PrivacyInfo.xcprivacy` declares the same eight types.

## Guideline audit (1 Nov 2026)

| Guideline | Check | State |
|---|---|---|
| 4.8 Login services | Google sign-in is offered | Sign in with Apple is offered beside it (Paid entitlement, `SignInView`) |
| 5.1.1(v) Account deletion | in-app | Me → Settings → Delete account, calls the server's delete; confirmation dialog |
| 5.1.1 Sign-in not required | app usable signed out | yes: catalogue bundled, history kept on the phone |
| 5.1.1 Privacy links in app | privacy policy reachable in the app | **fixed in this PR**: Settings → About has Support, Privacy Policy, Terms, version |
| 5.1.2 / 5.1.3 HealthKit | entitlement, usage strings, purpose in UI, policy | entitlement in `TigerWorkouts-Paid.entitlements`; both usage strings in Info.plist; Health section footer **now says** heart rate and bodyweight are kept with history when signed in and never sold or used for ads; privacy policy has an Apple Health section |
| Privacy manifest | `PrivacyInfo.xcprivacy` with required-reason APIs | UserDefaults (CA92.1, 1C8F.1) and file timestamps (C617.1) declared; collected types **extended in this PR** (name, other user content, customer support, diagnostics) |
| Permissions | a usage string for every permission asked | HealthKit (read and write). Notifications need none. No camera, photos, location, microphone, contacts. |
| Export compliance | `ITSAppUsesNonExemptEncryption` | `false` (HTTPS through URLSession only) |
| 2.1 Completeness | placeholder content | none found; seeded test data is `#if DEBUG` only |
| 2.1 Offline first launch | no crash without network | bundled catalogue; Supabase is called only when signed in; image loads fail to a placeholder |
| 2.5.4 Background modes | `audio` background mode | used while a workout runs, to play tones and keep the timer with the screen locked; explained in the review notes. The session holds a near-silent loop between tones, which a reviewer could question; the answer is in the notes |
| 2.3.7 Metadata | no trademarks in keywords, no prices, accurate | done |
| Icon | 1024 px, no alpha | `icon-1024.png` has no alpha; dark and tinted variants present |
| Launch screen | present | `UILaunchScreen` in Info.plist |
| Device family | iPhone only | `TARGETED_DEVICE_FAMILY: "1"`, so no iPad screenshots |
| Version | sane | 1.0, build set by App Store Connect |
| Support URL | resolves | https://tigerworkouts.com/support/ |

## Pages changed in this PR

- Privacy policy: coach notes, Sign in with Apple's hidden email, account email in a feedback note, a section "On your iPhone" (local notifications, widget, photos from tigerworkouts.com, no analytics), the delete path (Me → Settings → Delete account).
- Terms: delete path.
- Support: the delete path for iPhone and web, and how to send feedback from the app.
