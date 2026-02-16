import os
import requests
from requests_oauthlib import OAuth1
import sys

def delete_tweet(tweet_id):
    url = f"https://api.twitter.com/2/tweets/{tweet_id}"
    
    consumer_key = os.environ.get("TWITTER_CONSUMER_KEY")
    consumer_secret = os.environ.get("TWITTER_CONSUMER_SECRET")
    access_token = os.environ.get("TWITTER_ACCESS_TOKEN")
    access_token_secret = os.environ.get("TWITTER_ACCESS_TOKEN_SECRET")
    
    auth = OAuth1(consumer_key, consumer_secret, access_token, access_token_secret)
    
    response = requests.delete(url, auth=auth)
    
    if response.status_code == 200:
        print(f"Successfully deleted tweet {tweet_id}!")
        print(response.json())
    else:
        print(f"Failed to delete tweet {tweet_id}. Status: {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        delete_tweet(sys.argv[1])
    else:
        print("Usage: python3 delete_x.py <tweet_id>")
