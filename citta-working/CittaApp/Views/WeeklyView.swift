//
//  WeeklyView.swift
//  CittaApp
//
//  24 時間バーチカル週間ビュー
//

import SwiftUI
import SwiftData

struct WeeklyView: View {
    @Environment(\.modelContext) private var modelContext
    @Query private var scheduleItems: [ScheduleItem]
    
    @State private var currentWeekStart: Date = Date()
    @State private var showingAddSheet = false
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // 週間ヘッダー
                WeeklyHeader(weekStart: currentWeekStart)
                
                Divider()
                
                // 24 時間スクロールビュー
                WeeklyTimeGridView(
                    weekStart: currentWeekStart,
                    scheduleItems: scheduleItems
                )
                .onTapGesture {
                    showingAddSheet = true
                }
            }
            .navigationTitle("週間ビュー")
            .sheet(isPresented: $showingAddSheet) {
                AddScheduleSheet()
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: previousWeek) {
                    Image(systemName: "chevron.left")
                }
            }
            
            ToolbarItem(placement: .secondaryAction) {
                Button(action: nextWeek) {
                    Image(systemName: "chevron.right")
                }
            }
            
            ToolbarItem(placement: .secondaryAction) {
                Button("今日") {
                    currentWeekStart = Date()
                }
            }
        }
    }
    
    // MARK: - Navigation
    
    func previousWeek() {
        if let newDate = Calendar.current.date(byAdding: .day, value: -7, to: currentWeekStart) {
            currentWeekStart = newDate
        }
    }
    
    func nextWeek() {
        if let newDate = Calendar.current.date(byAdding: .day, value: 7, to: currentWeekStart) {
            currentWeekStart = newDate
        }
    }
}

// MARK: - WeeklyHeader

struct WeeklyHeader: View {
    let weekStart: Date
    
    var weekDays: [Date] {
        (0..<7).compactMap {
            Calendar.current.date(byAdding: .day, value: $0, to: weekStart)
        }
    }
    
    var body: some View {
        HStack(spacing: 0) {
            ForEach(weekDays, id: \.self) { date in
                VStack(spacing: 4) {
                    Text(dayOfWeek(for: date))
                        .font(.caption)
                        .foregroundColor(dayColor(for: date))
                    
                    Text("\(Calendar.current.component(.day, from: date))")
                        .font(.headline)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }
    
    func dayOfWeek(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE"
        return formatter.string(from: date)
    }
    
    func dayColor(for date: Date) -> Color {
        let weekday = Calendar.current.component(.weekday, from: date)
        if weekday == 1 { return .red }
        if weekday == 7 { return .blue }
        return .primary
    }
}

// MARK: - WeeklyTimeGridView

struct WeeklyTimeGridView: View {
    let weekStart: Date
    let scheduleItems: [ScheduleItem]
    
    var weekDays: [Date] {
        (0..<7).compactMap {
            Calendar.current.date(byAdding: .day, value: $0, to: weekStart)
        }
    }
    
    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(0..<24, id: \.self) { hour in
                    TimeSlotRow(hour: hour, weekDays: weekDays, scheduleItems: scheduleItems)
                }
            }
        }
    }
}

// MARK: - TimeSlotRow

struct TimeSlotRow: View {
    let hour: Int
    let weekDays: [Date]
    let scheduleItems: [ScheduleItem]
    
    var body: some View {
        HStack(spacing: 0) {
            // 時間ラベル
            Text("\(hour):00")
                .font(.caption)
                .foregroundColor(.secondary)
                .frame(width: 50)
            
            // 7 日間
            ForEach(weekDays, id: \.self) { day in
                ScheduleCell(hour: hour, day: day, scheduleItems: scheduleItems)
            }
        }
        .frame(height: 50)
    }
}

// MARK: - ScheduleCell

struct ScheduleCell: View {
    let hour: Int
    let day: Date
    let scheduleItems: [ScheduleItem]
    
    var schedulesForSlot: [ScheduleItem] {
        scheduleItems.filter { item in
            Calendar.current.isDate(item.startTime, inSameDayAs: day) &&
            Calendar.current.component(.hour, from: item.startTime) == hour
        }
    }
    
    var body: some View {
        VStack(spacing: 2) {
            ForEach(schedulesForSlot.prefix(3), id: \.id) { schedule in
                SchedulePill(schedule: schedule)
            }
            
            if schedulesForSlot.count > 3 {
                Text("+\(schedulesForSlot.count - 3)")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - SchedulePill

struct SchedulePill: View {
    let schedule: ScheduleItem
    
    var body: some View {
        Text(schedule.title)
            .font(.caption2)
            .foregroundColor(.white)
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .background(Color(hex: schedule.colorHex))
            .cornerRadius(4)
    }
}

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }
        
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - AddScheduleSheet

struct AddScheduleSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    
    @State private var title = ""
    @State private var category = "仕事"
    
    var body: some View {
        NavigationStack {
            Form {
                TextField("タイトル", text: $title)
                
                Picker("カテゴリ", selection: $category) {
                    ForEach(ScheduleItem.categories.keys.sorted(), id: \.self) { key in
                        Text(key)
                    }
                }
            }
            .navigationTitle("スケジュール追加")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        saveSchedule()
                    }
                }
            }
        }
    }
    
    func saveSchedule() {
        let now = Date()
        let item = ScheduleItem(
            title: title,
            startTime: now,
            endTime: Calendar.current.date(byAdding: .hour, value: 1, to: now)!,
            category: category,
            colorHex: ScheduleItem.categories[category] ?? "#8E8E93"
        )
        modelContext.insert(item)
        dismiss()
    }
}

#Preview {
    WeeklyView()
        .modelContainer(for: ScheduleItem.self, inMemory: true)
}