import os
import datetime
from duckduckgo_search import DDGS
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

def fetch_news(query="latest AI agent news trends", max_results=5):
    """Searches for latest AI agent news using DuckDuckGo."""
    print(f"Searching for: {query}...")
    results = []
    with DDGS() as ddgs:
        for r in ddgs.text(query, max_results=max_results):
            results.append(r)
    return results

def generate_sns_post(news_items, api_key=None):
    """Generates an SNS post draft using LLM or simple formatting."""
    
    # Prepare the context from news items
    context = "\n\n".join([f"Title: {item['title']}\nSnippet: {item['body']}\nSource: {item['href']}" for item in news_items])
    
    if api_key:
        print("Generating SNS post with LLM...")
        client = OpenAI(api_key=api_key)
        
        prompt = f"""
        You are 'Shiro', an AI agent trend reporter. 
        Based on the following news items about AI agents, create a structured SNS post draft (for X/Twitter).
        
        News Items:
        {context}
        
        Requirements:
        1. Tone: Professional, insightful, and slightly futuristic.
        2. Format: 
           - Catchy Headline
           - 3-4 Key Bullet Points (summarizing trends)
           - 'Shiro's Perspective' (short commentary)
           - Relevant Hashtags
        3. Language: Japanese (primary) with English technical terms where appropriate.
        """
        
        try:
            response = client.chat.completions.create(
                model="gpt-4o", # Defaulting to a high-quality model
                messages=[{"role": "system", "content": "You are a trend reporter agent."},
                          {"role": "user", "content": prompt}]
            )
            return response.choices[0].message.content
        except Exception as e:
            return f"Error generating with LLM: {e}\n\nFallback content:\n{context}"
    else:
        print("No API key found. Generating basic summary...")
        summary = "# Shiro Trend Report (Basic)\n\n"
        summary += "## Latest AI Agent News\n\n"
        for item in news_items:
            summary += f"### {item['title']}\n- {item['body']}\n- [Link]({item['href']})\n\n"
        return summary

def main():
    # 1. Fetch News
    news = fetch_news()
    
    if not news:
        print("No news found.")
        return

    # 2. Generate Content
    api_key = os.getenv("OPENAI_API_KEY")
    content = generate_sns_post(news, api_key)
    
    # 3. Save to Markdown
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
    filename = f"reports/report_{timestamp}.md"
    filepath = os.path.join(os.path.dirname(__file__), filename)
    
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    
    print(f"Success! Report generated: {filename}")

if __name__ == "__main__":
    main()
