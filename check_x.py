import os
import requests
from requests_oauthlib import OAuth1

def get_recent_tweets():
    url = "https://api.twitter.com/2/users/me/tweets"
    
    consumer_key = os.environ.get("TWITTER_CONSUMER_KEY")
    consumer_secret = os.environ.get("TWITTER_CONSUMER_SECRET")
    access_token = os.environ.get("TWITTER_ACCESS_TOKEN")
    access_token_secret = os.environ.get("TWITTER_ACCESS_TOKEN_SECRET")
    
    if not all([consumer_key, consumer_secret, access_token, access_token_secret]):
        print("Error: Missing Twitter API credentials.")
        return
    
    auth = OAuth1(consumer_key, consumer_secret, access_token, access_token_secret)
    
    params = {"max_results": 5}
    response = requests.get(url, auth=auth, params=params)
    
    if response.status_code == 200:
        print(response.json())
    else:
        print(f"Failed to fetch tweets. Status: {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    get_recent_tweets()
