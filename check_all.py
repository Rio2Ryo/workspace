import os
import requests
from requests_oauthlib import OAuth1

def check_more():
    consumer_key = os.environ.get("TWITTER_CONSUMER_KEY")
    consumer_secret = os.environ.get("TWITTER_CONSUMER_SECRET")
    access_token = os.environ.get("TWITTER_ACCESS_TOKEN")
    access_token_secret = os.environ.get("TWITTER_ACCESS_TOKEN_SECRET")
    auth = OAuth1(consumer_key, consumer_secret, access_token, access_token_secret)

    me_url = "https://api.twitter.com/2/users/me"
    user_id = requests.get(me_url, auth=auth).json()['data']['id']

    tweets_url = f"https://api.twitter.com/2/users/{user_id}/tweets"
    tweets_resp = requests.get(tweets_url, auth=auth, params={"max_results": 10})
    
    tweets = tweets_resp.json().get('data', [])
    for t in tweets:
        print(f"ID: {t['id']}, Text: {t['text'][:60]}")

if __name__ == "__main__":
    check_more()
