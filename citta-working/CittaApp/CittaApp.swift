//
//  CittaApp.swift
//  CittaApp
//
//  アプリケーションエントリーポイント
//

import SwiftUI
import SwiftData

@main
struct CittaApp: App {
    // SwiftData の ModelContainer
    var sharedModelContainer: ModelContainer = {
        let schema = Schema([
            ScheduleItem.self,
            WakuwakuItem.self,
            HandwritingNote.self
        ])
        
        let modelConfiguration = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false,
            cloudKitDatabase: .automatic // iCloud 同期を有効化
        )
        
        do {
            return try ModelContainer(
                for: schema,
                configurations: [modelConfiguration]
            )
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .modelContainer(sharedModelContainer)
        }
    }
}
