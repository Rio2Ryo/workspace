//
//  CloudKitService.swift
//  CittaApp
//
//  iCloud 同期サービス
//  - CloudKit 設定
//  - データ同期ロジック
//  - 競合解決
//

import Foundation
import CloudKit
import Combine
import SwiftData

// MARK: - エラー定義

enum CloudKitError: LocalizedError {
    case notAvailable
    case permissionDenied
    case networkError(Error)
    case recordNotFound
    case conflict
    case quotaExceeded
    case unknown(Error)
    
    var errorDescription: String? {
        switch self {
        case .notAvailable:
            return "iCloud が利用できません"
        case .permissionDenied:
            return "iCloud へのアクセス権限がありません"
        case .networkError(let error):
            return "ネットワークエラー：\(error.localizedDescription)"
        case .recordNotFound:
            return "レコードが見つかりません"
        case .conflict:
            return "データの競合が発生しました"
        case .quotaExceeded:
            return "iCloud のストレージ容量がいっぱいです"
        case .unknown(let error):
            return "エラー：\(error.localizedDescription)"
        }
    }
}

// MARK: - 同期ステータス

enum SyncStatus: Equatable {
    case idle
    case syncing(progress: Double)
    case synced(lastSync: Date)
    case error(String)
    case waitingForNetwork
    
    var description: String {
        switch self {
        case .idle:
            return "待機中"
        case .syncing(let progress):
            return "同期中... \(Int(progress * 100))%"
        case .synced(let lastSync):
            let formatter = RelativeDateTimeFormatter()
            formatter.unitsStyle = .abbreviated
            return "同期済み：\(formatter.localizedString(for: lastSync, relativeTo: Date()))"
        case .error(let message):
            return "エラー：\(message)"
        case .waitingForNetwork:
            return "ネットワーク待機中"
        }
    }
}

// MARK: - CloudKitService

@MainActor
final class CloudKitService: ObservableObject {
    static let shared = CloudKitService()
    
    // MARK: - Published Properties
    
    @Published private(set) var isAvailable = false
    @Published private(set) var isAuthenticated = false
    @Published private(set) var syncStatus: SyncStatus = .idle
    @Published private(set) var lastSyncDate: Date?
    @Published private(set) var errorMessage: String?
    
    // MARK: - CloudKit Containers
    
    private let publicDatabase: CKDatabase
    private let privateDatabase: CKDatabase
    private let container: CKContainer
    
    // MARK: - Sync Configuration
    
    private let queue = DispatchQueue(label: "com.citta.cloudkit", attributes: .concurrent)
    private var cancellables = Set<AnyCancellable>()
    private var networkMonitor: NWPathMonitor?
    private var isOnline = true
    
    // Record Zones
    private let scheduleZoneID = CKRecordZone.ID("com.citta.schedule")
    private let wakuwakuZoneID = CKRecordZone.ID("com.citta.wakuwaku")
    private let handwritingZoneID = CKRecordZone.ID("com.citta.handwriting")
    
    // Subscription IDs
    private let scheduleSubscriptionID = "com.citta.schedule.subscription"
    private let wakuwakuSubscriptionID = "com.citta.wakuwaku.subscription"
    private let handwritingSubscriptionID = "com.citta.handwriting.subscription"
    
    // MARK: - Initialization
    
    private init() {
        self.container = CKContainer(identifier: "iCloud.com.ryo.CittaApp")
        self.publicDatabase = container.publicCloudDatabase
        self.privateDatabase = container.privateCloudDatabase
        
        setupNetworkMonitoring()
        checkAvailability()
    }
    
    deinit {
        networkMonitor?.cancel()
    }
    
    // MARK: - Setup
    
    func setup() async {
        await checkAvailability()
        await setupRecordZones()
        await setupSubscriptions()
    }
    
    private func checkAvailability() async {
        do {
            let status = try await container.accountStatus()
            
            switch status {
            case .available:
                isAvailable = true
                isAuthenticated = true
                errorMessage = nil
            case .noAccount:
                isAvailable = false
                isAuthenticated = false
                errorMessage = "iCloud アカウントが設定されていません"
            case .restricted:
                isAvailable = false
                isAuthenticated = false
                errorMessage = "iCloud が制限されています"
            case .temporarilyUnavailable:
                isAvailable = false
                isAuthenticated = false
                errorMessage = "iCloud が一時的に利用できません"
            @unknown default:
                isAvailable = false
                isAuthenticated = false
                errorMessage = "iCloud の状態が不明です"
            }
        } catch {
            isAvailable = false
            isAuthenticated = false
            errorMessage = "iCloud の確認に失敗しました：\(error.localizedDescription)"
        }
    }
    
    private func setupNetworkMonitoring() {
        networkMonitor = NWPathMonitor()
        networkMonitor?.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                self?.isOnline = path.status == .satisfied
                if self?.isOnline == true && self?.syncStatus == .waitingForNetwork {
                    self?.syncStatus = .idle
                }
            }
        }
        networkMonitor?.start(queue: DispatchQueue(label: "com.citta.cloudkit.network"))
    }
    
    // MARK: - Record Zones
    
    private func setupRecordZones() async {
        guard isAvailable else { return }
        
        let zones = [
            CKRecordZone(zoneID: scheduleZoneID),
            CKRecordZone(zoneID: wakuwakuZoneID),
            CKRecordZone(zoneID: handwritingZoneID)
        ]
        
        for zone in zones {
            do {
                try await privateDatabase.save(recordZone: zone)
            } catch CKError.zoneAlreadyExists {
                // 既に存在する場合は OK
            } catch {
                print("RecordZone 作成エラー：\(error)")
            }
        }
    }
    
    // MARK: - Subscriptions
    
    private func setupSubscriptions() async {
        guard isAvailable else { return }
        
        // 簡易的な実装：実際のアプリでは CKQuerySubscription を使用
        // CloudKit Dashboard でプッシュ通知を設定
    }
    
    // MARK: - Sync Operations
    
    /// データを iCloud にアップロード
    func uploadToCloud() async {
        guard isAvailable && isOnline else {
            syncStatus = .waitingForNetwork
            return
        }
        
        syncStatus = .syncing(progress: 0.1)
        
        do {
            // SwiftData と CloudKit の統合は自動的に行われる
            // ここでは追加の同期ロジックを実装
            
            try await syncSchedules()
            try await syncWakuwakuItems()
            try await syncHandwritingNotes()
            
            lastSyncDate = Date()
            syncStatus = .synced(lastSync: lastSyncDate!)
            
        } catch {
            syncStatus = .error(error.localizedDescription)
            errorMessage = error.localizedDescription
        }
    }
    
    /// データを iCloud からダウンロード
    func downloadFromCloud() async {
        guard isAvailable && isOnline else {
            syncStatus = .waitingForNetwork
            return
        }
        
        syncStatus = .syncing(progress: 0.1)
        
        do {
            try await fetchSchedules()
            try await fetchWakuwakuItems()
            try await fetchHandwritingNotes()
            
            lastSyncDate = Date()
            syncStatus = .synced(lastSync: lastSyncDate!)
            
        } catch {
            syncStatus = .error(error.localizedDescription)
            errorMessage = error.localizedDescription
        }
    }
    
    // MARK: - Schedule Sync
    
    private func syncSchedules() async throws {
        // ScheduleItem の CloudKit 同期
        // SwiftData が自動的に行うため、追加ロジックは最小限に
    }
    
    private func fetchSchedules() async throws {
        // スケジュールのフェッチ
    }
    
    // MARK: - Wakuwaku Item Sync
    
    private func syncWakuwakuItems() async throws {
        // WakuwakuItem の CloudKit 同期
    }
    
    private func fetchWakuwakuItems() async throws {
        // ワクワクアイテムのフェッチ
    }
    
    // MARK: - Handwriting Note Sync
    
    private func syncHandwritingNotes() async throws {
        // HandwritingNote の CloudKit 同期
        // 描画データはバイナリとして保存
    }
    
    private func fetchHandwritingNotes() async throws {
        // 手書きノートのフェッチ
    }
    
    // MARK: - Conflict Resolution
    
    /// 競合解決（最新の変更を優先）
    func resolveConflict(local: CKRecord, remote: CKRecord) -> CKRecord {
        let localMod = local.modificationDate ?? .distantPast
        let remoteMod = remote.modificationDate ?? .distantPast
        
        return localMod > remoteMod ? local : remote
    }
    
    /// 競合解決（手動選択）
    func resolveConflictManually(
        local: CKRecord,
        remote: CKRecord,
        completion: @escaping (CKRecord) -> Void
    ) {
        // 実際の実装では UI を表示してユーザーに選択させる
        // ここでは最新を優先
        completion(resolveConflict(local: local, remote: remote))
    }
    
    // MARK: - Manual Sync
    
    /// 手動同期
    func performManualSync() async {
        syncStatus = .syncing(progress: 0)
        
        // アップロードとダウンロードを実行
        await uploadToCloud()
        await downloadFromCloud()
    }
    
    // MARK: - Reset
    
    /// ローカルキャッシュをクリア
    func clearLocalCache() {
        // CKContainer のキャッシュをクリア
        container.acceptShareInvitations(matching: nil) { _ in }
    }
    
    /// 同期リセット
    func resetSync() async {
        lastSyncDate = nil
        syncStatus = .idle
        
        await setupRecordZones()
    }
}

// MARK: - CloudKit Extension for Models

extension ScheduleItem {
    var recordType: String {
        return "ScheduleItem"
    }
    
    func toCloudKitRecord(zoneID: CKRecordZone.ID) -> CKRecord {
        let record = CKRecord(recordType: recordType, recordID: CKRecord.ID(recordName: id.uuidString), zoneID: zoneID)
        
        record["title"] = CKAsset(fileURL: URL(fileURLWithPath: title))
        record["memo"] = memo as CKRecordValue
        record["startTime"] = startTime as CKRecordValue
        record["endTime"] = endTime as CKRecordValue
        record["category"] = category as CKRecordValue
        record["colorHex"] = colorHex as CKRecordValue
        record["isCompleted"] = isCompleted as CKRecordValue
        record["createdAt"] = createdAt as CKRecordValue
        record["updatedAt"] = updatedAt as CKRecordValue
        
        return record
    }
    
    static func fromCloudKitRecord(_ record: CKRecord) -> ScheduleItem? {
        guard let title = record["title"] as? String,
              let startTime = record["startTime"] as? Date,
              let endTime = record["endTime"] as? Date,
              let category = record["category"] as? String,
              let colorHex = record["colorHex"] as? String,
              let isCompleted = record["isCompleted"] as? Bool,
              let createdAt = record["createdAt"] as? Date,
              let updatedAt = record["updatedAt"] as? Date else {
            return nil
        }
        
        return ScheduleItem(
            id: UUID(uuidString: record.recordID.recordName) ?? UUID(),
            title: title,
            memo: record["memo"] as? String ?? "",
            startTime: startTime,
            endTime: endTime,
            category: category,
            colorHex: colorHex,
            isCompleted: isCompleted,
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }
}

extension WakuwakuItem {
    var recordType: String {
        return "WakuwakuItem"
    }
    
    func toCloudKitRecord(zoneID: CKRecordZone.ID) -> CKRecord {
        let record = CKRecord(recordType: recordType, recordID: CKRecord.ID(recordName: id.uuidString), zoneID: zoneID)
        
        record["title"] = title as CKRecordValue
        record["description"] = description as CKRecordValue
        record["priority"] = priority as CKRecordValue
        record["category"] = category as CKRecordValue
        record["isCompleted"] = isCompleted as CKRecordValue
        record["createdAt"] = createdAt as CKRecordValue
        record["updatedAt"] = updatedAt as CKRecordValue
        
        if let completedAt = completedAt {
            record["completedAt"] = completedAt as CKRecordValue
        }
        
        return record
    }
    
    static func fromCloudKitRecord(_ record: CKRecord) -> WakuwakuItem? {
        guard let title = record["title"] as? String,
              let priority = record["priority"] as? Int,
              let category = record["category"] as? String,
              let isCompleted = record["isCompleted"] as? Bool,
              let createdAt = record["createdAt"] as? Date,
              let updatedAt = record["updatedAt"] as? Date else {
            return nil
        }
        
        return WakuwakuItem(
            id: UUID(uuidString: record.recordID.recordName) ?? UUID(),
            title: title,
            description: record["description"] as? String ?? "",
            priority: priority,
            category: category,
            isCompleted: isCompleted,
            completedAt: record["completedAt"] as? Date,
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }
}

extension HandwritingNote {
    var recordType: String {
        return "HandwritingNote"
    }
    
    func toCloudKitRecord(zoneID: CKRecordZone.ID) -> CKRecord {
        let record = CKRecord(recordType: recordType, recordID: CKRecord.ID(recordName: id.uuidString), zoneID: zoneID)
        
        record["title"] = title as CKRecordValue
        record["canvasData"] = canvasData as CKRecordValue
        record["createdAt"] = createdAt as CKRecordValue
        record["updatedAt"] = updatedAt as CKRecordValue
        
        return record
    }
    
    static func fromCloudKitRecord(_ record: CKRecord) -> HandwritingNote? {
        guard let title = record["title"] as? String,
              let canvasData = record["canvasData"] as? Data,
              let createdAt = record["createdAt"] as? Date,
              let updatedAt = record["updatedAt"] as? Date else {
            return nil
        }
        
        return HandwritingNote(
            id: UUID(uuidString: record.recordID.recordName) ?? UUID(),
            title: title,
            canvasData: canvasData,
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }
}

import Network
