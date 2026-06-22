import requests
import re
import json

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
}

# Rotowire often uses endpoints like this for props:
# https://www.rotowire.com/betting/ajax/props.php
# https://bet.rotowire.com/api/props
# Let's try grabbing the JS file to extract APIs
r = requests.get('https://bet.rotowire.com/js/app.js', headers=headers)
endpoints = set(re.findall(r'https://[\w\.\-]+/[/a-zA-Z0-9_\-\.]+', r.text))
print("Found Endpoints in JS:")
for e in endpoints:
    if 'rotowire' in e:
        print(e)
