//
//  SettingsView.swift
//  CittaApp
//
//  設定画面
//

import SwiftUI

struct SettingsView: View {
    @AppStorage("cloudflareWorkerUrl") private var cloudflareWorkerUrl = ""
    @AppStorage("iCloudSyncEnabled") private var iCloudSyncEnabled = true
    @AppStorage("handwritingDefaultTool") private var handwritingDefaultTool = "pen"
    
    var body: some View {
        NavigationStack {
            Form {
                // Cloudflare Workers 設定
                Section("Cloudflare Workers") {
                    TextField("Worker URL", text: $cloudflareWorkerUrl)
                        .keyboardType(.URL)
                        .autocapitalization(.none)
                    
                    Text("データ同期と共有に使用されます")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    if !cloudflareWorkerUrl.isEmpty {
                        Button("接続テスト") {
                            testConnection()
                        }
                    }
                }
                
                // iCloud 設定
                Section("iCloud") {
                    Toggle("iCloud 同期", isOn: $iCloudSyncEnabled)
                    
                    Text("iCloud を有効にすると、デバイス間でデータが同期されます")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                // 手書き設定
                Section("手書き入力") {
                    Picker("デフォルトツール", selection: $handwritingDefaultTool) {
                        Text("ペン").tag("pen")
                        Text("マーカー").tag("marker")
                        Text("鉛筆").tag("pencil")
                    }
                }
                
                // アプリ情報
                Section("アプリ情報") {
                    HStack {
                        Text("バージョン")
                        Spacer()
                        Text("1.0.0")
                            .foregroundColor(.secondary)
                    }
                    
                    HStack {
                        Text("ビルド")
                        Spacer()
                        Text("1")
                            .foregroundColor(.secondary)
                    }
                }
                
                // データ管理
                Section("データ管理", isExpanded: true) {
                    Button("データをエクスポート") {
                        exportData()
                    }
                    
                    Button("データをインポート", role: .destructive) {
                        importData()
                    }
                }
            }
            .navigationTitle("設定")
        }
    }
    
    private func testConnection() {
        // TODO: Cloudflare Workers 接続テスト
        print("接続テスト: \(cloudflareWorkerUrl)")
    }
    
    private func exportData() {
        // TODO: データエクスポート実装
        print("データエクスポート")
    }
    
    private func importData() {
        // TODO: データインポート実装
        print("データインポート")
    }
}

#Preview {
    SettingsView()
}
