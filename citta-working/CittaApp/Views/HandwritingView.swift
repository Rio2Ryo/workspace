//
//  HandwritingView.swift
//  CittaApp
//
//  PencilKit を使用した手書き入力ビュー
//

import SwiftUI
import PencilKit

struct HandwritingView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    
    let parentItemId: UUID?
    let parentItemType: ParentItemType
    
    @State private var canvasView = PKCanvasView()
    @State private var drawingTool = PKInkingTool(.pen, color: .black, width: 5)
    @State private var showingToolPicker = false
    @State private var title = ""
    
    enum ParentItemType {
        case schedule
        case wakuwaku
        case standalone
    }
    
    var body: some View {
        NavigationStack {
            VStack {
                // タイトル入力
                TextField("ノートタイトル", text: $title)
                    .textFieldStyle(.roundedBorder)
                    .padding()
                
                // キャンバス
                canvasView
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .drawingTool(drawingTool)
                    .onAppear {
                        canvasView.backgroundColor = .clear
                    }
                
                // ツールピッカー表示ボタン
                Button(action: { showingToolPicker.toggle() }) {
                    Label("ペンツール", systemImage: "pencil.tip")
                }
                .padding()
            }
            .navigationTitle("手書きノート")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        saveNote()
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showingToolPicker) {
                ToolPickerRepresentable(canvasView: canvasView)
                    .presentationDetents([.height(200)])
            }
        }
    }
    
    private func saveNote() {
        let note = HandwritingNote(
            title: title.isEmpty ? "手書きノート" : title,
            canvasData: canvasView.drawing.dataRepresentation()
        )
        
        modelContext.insert(note)
        
        // 親アイテムがある場合は関連付け
        // TODO: SwiftData の関係性を適切に設定
    }
}

// MARK: - ToolPicker の UIKit 表示
struct ToolPickerRepresentable: UIViewControllerRepresentable {
    let canvasView: PKCanvasView
    
    func makeUIViewController(context: Context) -> PKToolPickerViewController {
        let controller = PKToolPickerViewController()
        controller.canvasView = canvasView
        controller.setVisible(true)
        return controller
    }
    
    func updateUIViewController(_ uiViewController: PKToolPickerViewController, context: Context) {}
}

// MARK: - 手書きプレビュー
struct HandwritingPreview: View {
    let note: HandwritingNote
    
    var body: some View {
        if let drawing = note.loadDrawing() {
            CanvasViewRepresentable(drawing: drawing)
                .aspectRatio(drawing.bounds.size, contentMode: .fit)
        } else {
            Text("ノートがありません")
                .foregroundColor(.secondary)
        }
    }
}

// MARK: - キャンバス表示
struct CanvasViewRepresentable: UIViewRepresentable {
    let drawing: PKDrawing
    
    func makeUIView(context: Context) -> PKCanvasView {
        let canvasView = PKCanvasView()
        canvasView.drawing = drawing
        canvasView.backgroundColor = .clear
        canvasView.isUserInteractionEnabled = false
        return canvasView
    }
    
    func updateUIView(_ uiView: PKCanvasView, context: Context) {
        uiView.drawing = drawing
    }
}

// MARK: - 手書きボタン
struct HandwritingButton: View {
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: "pencil")
                Text("手書き")
            }
        }
    }
}

#Preview {
    HandwritingView(parentItemId: UUID(), parentItemType: .schedule)
        .modelContainer(for: HandwritingNote.self, inMemory: true)
}
