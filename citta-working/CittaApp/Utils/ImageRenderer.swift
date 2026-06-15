//
//  ImageRenderer.swift
//  CittaApp
//
//  画像生成ユーティリティ（簡易版）
//

import Foundation
import UIKit
import SwiftUI

// MARK: - ImageRendererService

final class ImageRendererService {
    static let shared = ImageRendererService()
    
    private init() {}
    
    // MARK: - 週間ビューのレンダリング
    
    /// 週間ビューを画像としてレンダリング
    func renderWeeklyView(
        weekStart: Date,
        scheduleItems: [ScheduleItem],
        size: CGSize
    ) -> UIImage {
        // 簡易実装：プレースホルダー画像を返す
        return UIGraphicsImageRenderer(size: size).image { ctx in
            UIColor.systemBackground.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            
            let paragraphStyle = NSMutableParagraphStyle()
            paragraphStyle.alignment = .center
            
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 24, weight: .bold),
                .foregroundColor: UIColor.label,
                .paragraphStyle: paragraphStyle
            ]
            
            let text = "週間ビュー"
            let textSize = text.size(withAttributes: attrs)
            let rect = CGRect(
                x: (size.width - textSize.width) / 2,
                y: (size.height - textSize.height) / 2,
                width: textSize.width,
                height: textSize.height
            )
            text.draw(in: rect, withAttributes: attrs)
        }
    }
    
    // MARK: - ワクワクリストのレンダリング
    
    /// ワクワクリストを画像としてレンダリング
    func renderWakuwakuList(
        items: [WakuwakuItem],
        size: CGSize
    ) -> UIImage {
        // 簡易実装：プレースホルダー画像を返す
        return UIGraphicsImageRenderer(size: size).image { ctx in
            UIColor.systemBackground.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            
            let paragraphStyle = NSMutableParagraphStyle()
            paragraphStyle.alignment = .center
            
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 24, weight: .bold),
                .foregroundColor: UIColor.label,
                .paragraphStyle: paragraphStyle
            ]
            
            let text = "ワクワクリスト"
            let textSize = text.size(withAttributes: attrs)
            let rect = CGRect(
                x: (size.width - textSize.width) / 2,
                y: (size.height - textSize.height) / 2,
                width: textSize.width,
                height: textSize.height
            )
            text.draw(in: rect, withAttributes: attrs)
        }
    }
    
    // MARK: - 手書きノートのレンダリング
    
    /// 手書きノートを画像としてレンダリング
    func renderHandwritingNote(
        note: HandwritingNote,
        size: CGSize
    ) -> UIImage? {
        // 簡易実装
        return nil
    }
}