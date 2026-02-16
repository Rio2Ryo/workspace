# Shiro-Trend-Reporter

Shiro-Trend-Reporter is a standalone tool designed to search for the latest AI agent news and generate structured SNS post drafts.

## Features
- **Automated Search**: Uses DuckDuckGo to find the latest trends in AI agents.
- **AI-Powered Synthesis**: Uses OpenAI (optional) to create a professional SNS post draft.
- **Markdown Output**: Saves everything to a clean markdown file in the `reports/` directory.

## Installation

1. Navigate to the directory:
   ```bash
   cd projects/shiro-trend-reporter
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. (Optional) Set up your API key:
   Create a `.env` file in the directory and add your OpenAI API key:
   ```env
   OPENAI_API_KEY=your_api_key_here
   ```
   *If no key is provided, the tool will still work but generate a simple summary instead of a refined SNS draft.*

## Usage

Run the reporter:
```bash
python reporter.py
```

Check the `reports/` folder for the generated markdown files.

## Project Structure
- `reporter.py`: Main script.
- `requirements.txt`: Python dependencies.
- `reports/`: Output directory for generated reports.
- `.env`: Environment variables (API keys).
