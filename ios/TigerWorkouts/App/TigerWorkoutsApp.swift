import SwiftUI

@main
struct TigerWorkoutsApp: App {
    @State private var store = Store()

    init() {
        Media.configureCache()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .task { await store.load() }
                .tint(Brand.coral)
        }
    }
}
