//
//  ContentView.swift
//  CittaApp
//
//  メイン画面 - タブ切り替え
//

import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    
    var body: some View {
        TabView {
            WeeklyView()
                .tabItem {
                    Label("週間", systemImage: "calendar")
                }
            
            WakuwakuListView()
                .tabItem {
                    Label("ワクワク", systemImage: "star.fill")
                }
            
            HandwritingView(parentItemId: nil, parentItemType: .standalone)
                .tabItem {
                    Label("ノート", systemImage: "pencil.tip")
                }
            
            SettingsView()
                .tabItem {
                    Label("設定", systemImage: "gear")
                }
        }
    }
}

#Preview {
    ContentView()
        .modelContainer(for: ScheduleItem.self, inMemory: true)
}