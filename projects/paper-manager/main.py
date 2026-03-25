#!/usr/bin/env python3
"""
論文管理システム MVP
Usage: python main.py <pdf_path> [--dry-run]
"""
import argparse
import json
import sys
from pathlib import Path

from config import INBOX_DIR, PROCESSED_DIR, validate_config
from extractors.pdf_extractor import extract_text
from extractors.ai_extractor import extract_metadata, generate_summary
from extractors.db_verifier import verify_metadata
from utils.filename import generate_filename, rename_pdf
from notion.client import register_paper


def process_pdf(pdf_path: Path, dry_run: bool = False) -> dict:
    """1件のPDFを処理して結果dictを返す。"""
    print(f"\n{'='*60}")
    print(f"処理開始: {pdf_path.name}")
    print("="*60)

    # Step 1: PDF テキスト抽出
    print("\n[1/5] PDFテキスト抽出...")
    text = extract_text(pdf_path)
    print(f"  抽出文字数: {len(text):,}")

    # Step 2: AI メタデータ抽出
    print("\n[2/5] Claude API でメタデータ抽出...")
    ai_meta = extract_metadata(text)
    print(f"  AI抽出結果: {json.dumps(ai_meta, ensure_ascii=False, indent=2)}")

    # Step 3: CiNii / NDL で照合・精査
    print("\n[3/5] CiNii / NDL で照合・精査...")
    verified_meta = verify_metadata(ai_meta)

    # 照合後のメタデータ表示（内部フィールドを除いて）
    display = {k: v for k, v in verified_meta.items() if k not in ("cinii_result", "ndl_result")}
    print(f"  精査済みメタデータ: {json.dumps(display, ensure_ascii=False, indent=2)}")

    # Step 4: ファイル名生成
    print("\n[4/5] ファイル名生成...")
    filename = generate_filename(verified_meta)
    if filename:
        print(f"  生成ファイル名: {filename}")
    else:
        print("  ファイル名生成スキップ（不明フィールドあり）")
        filename = None

    # Step 5: 要約生成
    print("\n[5/5] 論文要約を生成...")
    summary = generate_summary(text)
    print(f"  要約:\n{summary}\n")

    result = {
        "original_path": str(pdf_path),
        "metadata": display,
        "filename": filename,
        "summary": summary,
        "notion_page_id": None,
        "new_path": None,
    }

    if dry_run:
        print("[DRY RUN] Notion登録・リネームをスキップ")
        return result

    # Notion 登録
    print("\nNotion DB に登録中...")
    try:
        page_id = register_paper(verified_meta, summary, filename, pdf_path)
        result["notion_page_id"] = page_id
        print(f"  登録完了: page_id={page_id}")
    except Exception as e:
        print(f"  [エラー] Notion登録失敗: {e}")

    # PDF リネーム & 移動
    if filename:
        try:
            new_path = rename_pdf(pdf_path, filename, PROCESSED_DIR)
            result["new_path"] = str(new_path)
            print(f"\nPDF移動完了: {new_path}")
        except Exception as e:
            print(f"  [エラー] リネーム失敗: {e}")

    return result


def main():
    parser = argparse.ArgumentParser(description="論文PDF管理ツール")
    parser.add_argument("pdf", nargs="?", help="処理するPDFファイルのパス")
    parser.add_argument("--dry-run", action="store_true", help="Notion登録・リネームを実行しない")
    parser.add_argument("--inbox", action="store_true", help="inbox/ ディレクトリの全PDFを処理")
    args = parser.parse_args()

    if not args.dry_run:
        try:
            validate_config()
        except EnvironmentError as e:
            print(f"[設定エラー] {e}")
            print("  .env.example を参考に .env を作成してください")
            sys.exit(1)

    if args.inbox:
        pdfs = list(INBOX_DIR.glob("*.pdf"))
        if not pdfs:
            print(f"inbox/ にPDFが見つかりません: {INBOX_DIR}")
            sys.exit(0)
        for pdf in pdfs:
            process_pdf(pdf, dry_run=args.dry_run)
    elif args.pdf:
        pdf_path = Path(args.pdf)
        if not pdf_path.exists():
            print(f"ファイルが見つかりません: {pdf_path}")
            sys.exit(1)
        result = process_pdf(pdf_path, dry_run=args.dry_run)
        print("\n--- 処理結果サマリー ---")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        parser.print_help()
        print(f"\nUsage例:")
        print(f"  python main.py paper.pdf")
        print(f"  python main.py paper.pdf --dry-run")
        print(f"  python main.py --inbox")


if __name__ == "__main__":
    main()
