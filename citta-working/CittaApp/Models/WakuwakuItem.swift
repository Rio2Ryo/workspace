//
//  WakuwakuItem.swift
//  CittaApp
//
//  ワクワクリスト（やりたいことリスト）のデータモデル
//

import Foundation
import SwiftData

@Model
final class WakuwakuItem {
    @Attribute(.unique) var id: UUID
    var title: String
    var desc: String
    var priority: Int // 1-5
    var category: String
    var isCompleted: Bool
    var completedAt: Date?
    var createdAt: Date
    var updatedAt: Date
    
    // 手書きノートとの関係
    @Relationship(deleteRule: .cascade) var handwritingNotes: [HandwritingNote]
    
    init(
        id: UUID = UUID(),
        title: String,
        desc: String = "",
        priority: Int = 3,
        category: String = "その他",
        isCompleted: Bool = false,
        completedAt: Date? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        handwritingNotes: [HandwritingNote] = []
    ) {
        self.id = id
        self.title = title
        self.desc = desc
        self.priority = priority
        self.category = category
        self.isCompleted = isCompleted
        self.completedAt = completedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.handwritingNotes = handwritingNotes
    }
}

// MARK: - カテゴリ定義
extension WakuwakuItem {
    static let categories = [
        "旅行": "#FF9500",
        "趣味": "#FF2D55",
        "学習": "#AF52DE",
        "健康": "#34C759",
        "人間関係": "#007AFF",
        "その他": "#8E8E93"
    ]
}

// MARK: - プライオリティラベル
extension WakuwakuItem {
    var priorityLabel: String {
        switch priority {
        case 5: return "⭐️⭐️⭐️⭐️⭐️"
        case 4: return "⭐️⭐️⭐️⭐️"
        case 3: return "⭐️⭐️⭐️"
        case 2: return "⭐️⭐️"
        case 1: return "⭐️"
        default: return "⭐️⭐️⭐️"
        }
    }
}
