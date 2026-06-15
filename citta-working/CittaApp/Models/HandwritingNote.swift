//
//  HandwritingNote.swift
//  CittaApp
//
//  手書きノートのデータモデル
//

import Foundation
import SwiftData
import PencilKit

@Model
final class HandwritingNote {
    @Attribute(.unique) var id: UUID
    var title: String
    var canvasData: Data
    var createdAt: Date
    var updatedAt: Date
    
    // 関連するスケジュール
    @Relationship var schedule: ScheduleItem?
    
    init(
        id: UUID = UUID(),
        title: String = "",
        canvasData: Data = Data(),
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        schedule: ScheduleItem? = nil
    ) {
        self.id = id
        self.title = title
        self.canvasData = canvasData
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.schedule = schedule
    }
    
    // MARK: - Drawing Access
    
    func loadDrawing() -> PKDrawing? {
        do {
            return try PKDrawing(data: canvasData)
        } catch {
            print("Failed to load drawing: \(error)")
            return nil
        }
    }
    
    func saveDrawing(_ drawing: PKDrawing) {
        canvasData = drawing.dataRepresentation()
        updatedAt = Date()
    }
    
    // MARK: - Export (簡易実装)
    
    func exportToPDF() -> Data? {
        // iOS 26 の API 変更に伴い簡易実装
        return nil
    }
    
    func exportToImage() -> UIImage? {
        // iOS 26 の API 変更に伴い簡易実装
        return nil
    }
}