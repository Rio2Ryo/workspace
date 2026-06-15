//
//  ScheduleItem.swift
//  CittaApp
//
//  スケジュールのデータモデル
//

import Foundation
import SwiftData

@Model
final class ScheduleItem {
    @Attribute(.unique) var id: UUID
    var title: String
    var memo: String
    var startTime: Date
    var endTime: Date
    var category: String
    var colorHex: String
    var isCompleted: Bool
    var createdAt: Date
    var updatedAt: Date
    
    // 手書きノートとの関係
    @Relationship(deleteRule: .cascade) var handwritingNotes: [HandwritingNote]
    
    // カテゴリ定義
    static let categories = [
        "仕事": "#FF9500",
        "プライベート": "#007AFF",
        "勉強": "#34C759",
        "健康": "#FF2D55",
        "その他": "#8E8E93"
    ]
    
    init(
        id: UUID = UUID(),
        title: String,
        memo: String = "",
        startTime: Date,
        endTime: Date,
        category: String = "その他",
        colorHex: String = "#8E8E93",
        isCompleted: Bool = false,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        handwritingNotes: [HandwritingNote] = []
    ) {
        self.id = id
        self.title = title
        self.memo = memo
        self.startTime = startTime
        self.endTime = endTime
        self.category = category
        self.colorHex = colorHex
        self.isCompleted = isCompleted
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.handwritingNotes = handwritingNotes
    }
}