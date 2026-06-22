import asyncio
import json
import re
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
        )
        
        try:
            # Navigate to the Strikeouts prop page
            await page.goto("https://www.rotowire.com/betting/mlb/player-props.php")
            
            # Wait a few seconds for React/Vue rendering and API calls
            await page.wait_for_timeout(5000)
            
            # Get the entire innerText of the page
            text_content = await page.evaluate("document.body.innerText")
            lines = [l.strip() for l in text_content.split('\\n') if l.strip()]
            
            props = []
            
            # Simple heuristic text parsing just like the TS script
            for i, line in enumerate(lines):
                if re.match(r'^[0-9]+\\.5$', line):
                    # Look backwards for player name
                    player_name = ""
                    for j in range(i - 1, max(-1, i - 6), -1):
                        if not re.search(r'[0-9\\+\\-\\@]', lines[j]) and len(lines[j]) > 4 and " " in lines[j]:
                            player_name = lines[j]
                            break
                            
                    # Look forwards for odds
                    over_odds = 0
                    under_odds = 0
                    odds_found = 0
                    
                    for j in range(i + 1, min(len(lines), i + 6)):
                        match = re.match(r'^([+-]\\d{3})$', lines[j])
                        if match:
                            if odds_found == 0:
                                over_odds = int(match.group(1))
                            elif odds_found == 1:
                                under_odds = int(match.group(1))
                            odds_found += 1
                            if odds_found >= 2:
                                break
                                
                    if player_name and odds_found >= 1:
                        props.append({
                            "playerName": player_name,
                            "line": float(line),
                            "overOdds": over_odds,
                            "underOdds": under_odds
                        })
            
            # Deduplicate by player name
            unique_props = {}
            for prop in props:
                if prop["playerName"] not in unique_props:
                    unique_props[prop["playerName"]] = prop
            
            # Print as JSON array so Node can parse it
            print(json.dumps(list(unique_props.values())))
            
        except Exception as e:
            print(json.dumps({"error": str(e)}))
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
