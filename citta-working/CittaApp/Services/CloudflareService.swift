//
//  CloudflareService.swift
//  CittaApp
//
//  Cloudflare Workers API 連携（簡易版）
//

import Foundation

// MARK: - CloudflareService

final class CloudflareService: ObservableObject {
    static let shared = CloudflareService()
    
    @Published var baseURL: String = "https://citta-backend.common-gifted-tokyo.workers.dev"
    @Published var isConnected: Bool = false
    @Published var authToken: String?
    
    private let session: URLSession
    private let cache: NSCache<NSString, CachedResponse>
    
    private init() {
        self.session = URLSession(configuration: .default)
        self.cache = NSCache()
    }
    
    // MARK: - 認証
    
    func login(email: String, password: String) async throws -> Bool {
        // 簡易実装
        isConnected = true
        return true
    }
    
    func logout() {
        authToken = nil
        isConnected = false
    }
    
    // MARK: - スケジュール
    
    func fetchSchedules(from startDate: Date, to endDate: Date) async throws -> [ScheduleItem] {
        // 簡易実装：ローカルデータを返す
        return []
    }
    
    func createSchedule(_ item: ScheduleItem) async throws -> ScheduleItem {
        // 簡易実装
        return item
    }
    
    func updateSchedule(_ item: ScheduleItem) async throws -> ScheduleItem {
        // 簡易実装
        return item
    }
    
    func deleteSchedule(id: UUID) async throws {
        // 簡易実装
    }
    
    // MARK: - ワクワクリスト
    
    func fetchWakuwakuItems() async throws -> [WakuwakuItem] {
        // 簡易実装
        return []
    }
    
    func createWakuwakuItem(_ item: WakuwakuItem) async throws -> WakuwakuItem {
        // 簡易実装
        return item
    }
    
    func updateWakuwakuItem(_ item: WakuwakuItem) async throws -> WakuwakuItem {
        // 簡易実装
        return item
    }
    
    func deleteWakuwakuItem(id: UUID) async throws {
        // 簡易実装
    }
    
    // MARK: - ノート
    
    func uploadNoteImage(_ data: Data, for noteId: UUID) async throws -> URL {
        // 簡易実装
        return URL(string: "https://example.com/image.jpg")!
    }
    
    func fetchNotes() async throws -> [HandwritingNote] {
        // 簡易実装
        return []
    }
}

// MARK: - CachedResponse

private class CachedResponse: NSObject {
    let data: Data
    let timestamp: Date
    
    init(data: Data) {
        self.data = data
        self.timestamp = Date()
    }
}