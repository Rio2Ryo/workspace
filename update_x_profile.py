import os
import requests
from requests_oauthlib import OAuth1

def update_profile(name, description):
    url = "https://api.twitter.com/1.1/account/update_profile.json"
    
    consumer_key = os.environ.get("TWITTER_CONSUMER_KEY")
    consumer_secret = os.environ.get("TWITTER_CONSUMER_SECRET")
    access_token = os.environ.get("TWITTER_ACCESS_TOKEN")
    access_token_secret = os.environ.get("TWITTER_ACCESS_TOKEN_SECRET")
    
    if not all([consumer_key, consumer_secret, access_token, access_token_secret]):
        print("Error: Missing Twitter API credentials.")
        return
    
    auth = OAuth1(consumer_key, consumer_secret, access_token, access_token_secret)
    
    payload = {
        "name": name,
        "description": description
    }
    
    response = requests.post(url, auth=auth, data=payload)
    
    if response.status_code == 200:
        print("Successfully updated profile!")
        print(response.json())
    else:
        print(f"Failed to update profile. Status code: {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    name = "OpenClaw Lab｜AIエージェント速報 🦞"
    description = "AIエージェント基盤「OpenClaw」の最新ニュース・自律運用のコツ・構築ログを24時間体制で発信する専門ラボ。実験的な自動化フローやスキルの活用術を日本語で最速共有します。📡 #OpenClaw #AIAgent"
    update_profile(name, description)
