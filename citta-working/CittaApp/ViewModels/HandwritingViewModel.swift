//
//  HandwritingViewModel.swift
//  CittaApp
//
//  手書きノート ViewModel（簡易版）
//

import SwiftUI
import PencilKit
import SwiftData

@MainActor
final class HandwritingViewModel: ObservableObject {
    @Published var noteTitle: String = ""
    @Published var showingShareSheet: Bool = false
    @Published var errorMessage: String?
    @Published var canUndo: Bool = false
    @Published var canRedo: Bool = false
    
    private var modelContext: ModelContext?
    private var currentNote: HandwritingNote?
    private let shareService = ShareService.shared
    
    // MARK: - 初期化
    
    init(modelContext: ModelContext? = nil) {
        self.modelContext = modelContext
    }
    
    // MARK: - 描画管理
    
    func saveDrawing(_ drawing: PKDrawing) {
        guard let context = modelContext else { return }
        
        let note = currentNote ?? HandwritingNote(title: noteTitle)
        note.canvasData = drawing.dataRepresentation()
        note.updatedAt = Date()
        
        if currentNote == nil {
            context.insert(note)
            currentNote = note
        }
    }
    
    // MARK: - Undo/Redo
    
    func undo() {
        canUndo = false
    }
    
    func redo() {
        canRedo = false
    }
    
    // MARK: - 共有
    
    func shareNote(_ note: HandwritingNote, asPDF: Bool = false, from sourceView: UIView?) {
        if shareService.shareHandwritingNote(note: note, asPDF: asPDF, from: sourceView) != nil {
            showingShareSheet = true
        } else {
            errorMessage = "共有に失敗しました"
        }
    }
    
    // MARK: - 保存
    
    func saveCurrentDrawingToPhotoLibrary() {
        errorMessage = "写真ライブラリへの保存は現在利用できません"
    }
}