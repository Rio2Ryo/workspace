import os
import requests
from requests_oauthlib import OAuth1
import json
import sys

def post_tweet(text):
    # Strict Idempotency: Use a hash or the text itself to avoid double posting in the same session
    log_file = "last_posted_text.txt"
    if os.path.exists(log_file):
        with open(log_file, "r") as f:
            if f.read().strip() == text.strip():
                print("Error: Attempted to post duplicate content. Aborting to prevent double-post.")
                return

    url = "https://api.twitter.com/2/tweets"
    
    consumer_key = os.environ.get("TWITTER_CONSUMER_KEY")
    consumer_secret = os.environ.get("TWITTER_CONSUMER_SECRET")
    access_token = os.environ.get("TWITTER_ACCESS_TOKEN")
    access_token_secret = os.environ.get("TWITTER_ACCESS_TOKEN_SECRET")
    
    if not all([consumer_key, consumer_secret, access_token, access_token_secret]):
        print("Error: Missing Twitter API credentials.")
        return
    
    auth = OAuth1(consumer_key, consumer_secret, access_token, access_token_secret)
    
    payload = {"text": text}
    try:
        # Use a reasonable timeout
        response = requests.post(url, auth=auth, json=payload, timeout=30)
        
        # Log the raw output for Sora
        print(f"Status Code: {response.status_code}")
        print("Raw Response:")
        print(response.text)
        
        if response.status_code == 201:
            # Save to log ONLY after confirmed success
            with open(log_file, "w") as f:
                f.write(text.strip())
        else:
            print("Post failed.")
            
    except Exception as e:
        print(f"An error occurred during API call: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        post_tweet(sys.argv[1])
    else:
        print("Usage: python3 post_x.py 'Your tweet text'")
