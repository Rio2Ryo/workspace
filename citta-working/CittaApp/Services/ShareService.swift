//
//  ShareService.swift
//  CittaApp
//
//  共有機能（簡易版）
//

import Foundation
import UIKit
import SwiftUI

// MARK: - ShareService

final class ShareService {
    static let shared = ShareService()
    
    private init() {}
    
    // MARK: - 週間ビューの共有
    
    func shareWeeklyView(
        weekStart: Date,
        scheduleItems: [ScheduleItem],
        from sourceView: UIView?
    ) -> UIActivityViewController? {
        let image = ImageRendererService.shared.renderWeeklyView(
            weekStart: weekStart,
            scheduleItems: scheduleItems,
            size: CGSize(width: 1200, height: 800)
        )
        
        let activityVC = UIActivityViewController(
            activityItems: [image],
            applicationActivities: nil
        )
        
        if let popover = activityVC.popoverPresentationController,
           let sourceView = sourceView {
            popover.sourceView = sourceView
            popover.sourceRect = sourceView.bounds
        }
        
        return activityVC
    }
    
    // MARK: - ワクワクリストの共有
    
    func shareWakuwakuList(
        items: [WakuwakuItem],
        from sourceView: UIView?
    ) -> UIActivityViewController? {
        let image = ImageRendererService.shared.renderWakuwakuList(
            items: items,
            size: CGSize(width: 800, height: 1200)
        )
        
        let activityVC = UIActivityViewController(
            activityItems: [image],
            applicationActivities: nil
        )
        
        if let popover = activityVC.popoverPresentationController,
           let sourceView = sourceView {
            popover.sourceView = sourceView
            popover.sourceRect = sourceView.bounds
        }
        
        return activityVC
    }
    
    // MARK: - 手書きノートの共有
    
    func shareHandwritingNote(
        note: HandwritingNote,
        asPDF: Bool,
        from sourceView: UIView?
    ) -> UIActivityViewController? {
        // 簡易実装
        let text = note.title
        
        let activityVC = UIActivityViewController(
            activityItems: [text],
            applicationActivities: nil
        )
        
        if let popover = activityVC.popoverPresentationController,
           let sourceView = sourceView {
            popover.sourceView = sourceView
            popover.sourceRect = sourceView.bounds
        }
        
        return activityVC
    }
    
    // MARK: - Deep Link
    
    func generateDeepLink(for resourceType: ShareResourceType, id: UUID) -> URL? {
        // 簡易実装
        return nil
    }
    
    func parseDeepLink(url: URL) -> (ShareResourceType, UUID)? {
        // 簡易実装
        return nil
    }
}

// MARK: - ShareResourceType

enum ShareResourceType: String {
    case schedule = "schedule"
    case wakuwaku = "wakuwaku"
    case note = "note"
}