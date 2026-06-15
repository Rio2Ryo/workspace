//
//  WakuwakuListView.swift
//  CittaApp
//
//  ワクワクリスト画面
//

import SwiftUI
import SwiftData

struct WakuwakuListView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \WakuwakuItem.priority, order: .reverse) private var wakuwakuItems: [WakuwakuItem]
    
    @State private var showingAddSheet = false
    @State private var selectedFilter: String = "すべて"
    
    var filteredItems: [WakuwakuItem] {
        if selectedFilter == "すべて" {
            return wakuwakuItems
        } else if selectedFilter == "未完了" {
            return wakuwakuItems.filter { !$0.isCompleted }
        } else {
            return wakuwakuItems.filter { $0.category == selectedFilter }
        }
    }
    
    var body: some View {
        NavigationStack {
            VStack {
                // フィルター
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        FilterChip(title: "すべて", isSelected: selectedFilter == "すべて") {
                            selectedFilter = "すべて"
                        }
                        
                        FilterChip(title: "未完了", isSelected: selectedFilter == "未完了") {
                            selectedFilter = "未完了"
                        }
                        
                        ForEach(WakuwakuItem.categories.keys.sorted(), id: \.self) { category in
                            FilterChip(title: category, isSelected: selectedFilter == category) {
                                selectedFilter = category
                            }
                        }
                    }
                    .padding(.horizontal)
                }
                .padding(.vertical, 8)
                
                // リスト
                List(filteredItems) { item in
                    WakuwakuItemRow(item: item)
                }
                .listStyle(.plain)
            }
            .navigationTitle("ワクワクリスト")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button(action: { showingAddSheet = true }) {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingAddSheet) {
                AddWakuwakuSheet()
            }
        }
    }
    
    private func deleteItem(_ item: WakuwakuItem) {
        modelContext.delete(item)
    }
}

// MARK: - FilterChip

struct FilterChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? Color.blue : Color.gray.opacity(0.2))
                .foregroundColor(isSelected ? .white : .primary)
                .cornerRadius(16)
        }
    }
}

// MARK: - WakuwakuItemRow

struct WakuwakuItemRow: View {
    let item: WakuwakuItem
    
    var body: some View {
        HStack {
            // 優先度
            Text(priorityIcon(for: item.priority))
                .font(.title2)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(.headline)
                
                if !item.desc.isEmpty {
                    Text(item.desc)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }
                
                Text(item.category)
                    .font(.caption2)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(Color.blue.opacity(0.2))
                    .foregroundColor(.blue)
                    .cornerRadius(4)
            }
            
            Spacer()
            
            // 完了チェック
            Image(systemName: item.isCompleted ? "checkmark.circle.fill" : "circle")
                .foregroundColor(item.isCompleted ? .green : .gray)
        }
        .padding(.vertical, 4)
        .opacity(item.isCompleted ? 0.6 : 1.0)
    }
    
    func priorityIcon(for priority: Int) -> String {
        String(repeating: "⭐️", count: priority)
    }
}

// MARK: - AddWakuwakuSheet

struct AddWakuwakuSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    
    @State private var title = ""
    @State private var desc = ""
    @State private var priority = 3
    @State private var category = "その他"
    
    var body: some View {
        NavigationStack {
            Form {
                TextField("タイトル", text: $title)
                TextField("説明", text: $desc, axis: .vertical)
                
                Stepper("優先度：\(priority)", value: $priority, in: 1...5)
                
                Picker("カテゴリ", selection: $category) {
                    ForEach(WakuwakuItem.categories.keys.sorted(), id: \.self) { key in
                        Text(key)
                    }
                }
            }
            .navigationTitle("新規追加")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        saveItem()
                    }
                }
            }
        }
    }
    
    private func saveItem() {
        let item = WakuwakuItem(
            title: title,
            desc: desc,
            priority: priority,
            category: category
        )
        
        modelContext.insert(item)
        dismiss()
    }
}

#Preview {
    WakuwakuListView()
        .modelContainer(for: WakuwakuItem.self, inMemory: true)
}