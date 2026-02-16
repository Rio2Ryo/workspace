import os
import requests
from requests_oauthlib import OAuth1

def check_and_cleanup():
    consumer_key = os.environ.get("TWITTER_CONSUMER_KEY")
    consumer_secret = os.environ.get("TWITTER_CONSUMER_SECRET")
    access_token = os.environ.get("TWITTER_ACCESS_TOKEN")
    access_token_secret = os.environ.get("TWITTER_ACCESS_TOKEN_SECRET")
    auth = OAuth1(consumer_key, consumer_secret, access_token, access_token_secret)

    # 1. Get My User ID
    me_url = "https://api.twitter.com/2/users/me"
    me_resp = requests.get(me_url, auth=auth)
    if me_resp.status_code != 200:
        print(f"Me failed: {me_resp.text}")
        return
    user_id = me_resp.json()['data']['id']
    print(f"Logged in as User ID: {user_id}")

    # 2. List Recent Tweets
    tweets_url = f"https://api.twitter.com/2/users/{user_id}/tweets"
    tweets_resp = requests.get(tweets_url, auth=auth, params={"max_results": 5})
    if tweets_resp.status_code != 200:
        print(f"Tweets failed: {tweets_resp.text}")
        return
    
    tweets = tweets_resp.json().get('data', [])
    print("Recent Tweets:")
    for t in tweets:
        print(f"- ID: {t['id']}, Text: {t['text'][:50]}...")

if __name__ == "__main__":
    check_and_cleanup()
